import { Router, Request, Response } from 'express';
import { Client } from '@notionhq/client';
import CryptoJS from 'crypto-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { authenticateToken } from '@/middleware/auth';
import { IntegrationsRepository } from '@/repositories/IntegrationsRepository';

const router = Router();

/**
 * Start Notion OAuth flow
 * GET /api/notion/oauth/start
 */
router.get('/oauth/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Generate OAuth state parameter for security
    const state = CryptoJS.lib.WordArray.random(32).toString();
    
    // Store state in session or temporary storage (in production, use Redis)
    // For now, we'll include it in the redirect URL
    
    // Debug logging for environment variables
    console.log('🔍 Notion OAuth Debug:');
    console.log('🔍 NOTION_CLIENT_ID:', env.NOTION_CLIENT_ID);
    console.log('🔍 NOTION_CLIENT_SECRET:', env.NOTION_CLIENT_SECRET ? '***SET***' : 'NOT SET');
    console.log('🔍 NOTION_REDIRECT_URI:', env.NOTION_REDIRECT_URI);
    
    // Validate required environment variables
    if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET || !env.NOTION_REDIRECT_URI) {
      logger.error('Missing required Notion OAuth environment variables', {
        hasClientId: !!env.NOTION_CLIENT_ID,
        hasClientSecret: !!env.NOTION_CLIENT_SECRET,
        hasRedirectUri: !!env.NOTION_REDIRECT_URI,
      });
      
      return res.status(500).json({
        ok: false,
        error: 'Notion OAuth configuration incomplete. Please check environment variables.',
        details: {
          missing: [
            !env.NOTION_CLIENT_ID && 'NOTION_CLIENT_ID',
            !env.NOTION_CLIENT_SECRET && 'NOTION_CLIENT_SECRET',
            !env.NOTION_REDIRECT_URI && 'NOTION_REDIRECT_URI',
          ].filter(Boolean),
        },
      });
    }
    
    // Build Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', env.NOTION_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.NOTION_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');
    // authUrl.searchParams.set('state', state);
    
    console.log('notion authurl =>',authUrl)
    // Add scopes for read and write access
    const scopes = ['read', 'write'];
    authUrl.searchParams.set('scope', scopes.join(' '));

    logger.info('Notion OAuth flow started', {
      userId: req.user.id,
      state,
    });

    // Return the OAuth URL for the frontend to handle the redirect
    res.json({
      ok: true,
      data: {
        authUrl: authUrl.toString(),
        state,
      },
    });
  } catch (error) {
    logger.error('Error starting Notion OAuth flow:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to start OAuth flow',
    });
  }
});

/**
 * Notion OAuth callback
 * GET /api/notion/oauth/callback
 */
router.get('/oauth/callback', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const { code, state, error: oauthError } = req.query;

    // Check for OAuth errors
    if (oauthError) {
      logger.warn('Notion OAuth error received', {
        userId: req.user.id,
        error: oauthError,
      });

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?error=oauth_failed&message=${encodeURIComponent(String(oauthError))}`);
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      logger.warn('Notion OAuth callback missing code parameter', {
        userId: req.user.id,
        query: req.query,
      });

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?error=missing_code`);
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      logger.error('Failed to exchange Notion OAuth code for token', {
        userId: req.user.id,
        status: tokenResponse.status,
        error: errorData,
      });

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, workspace_id, workspace_name, owner } = tokenData;

    // Encrypt the access token before storing
    const encryptedAccessToken = CryptoJS.AES.encrypt(access_token, env.ENCRYPTION_KEY).toString();
    const encryptedRefreshToken = refresh_token ? CryptoJS.AES.encrypt(refresh_token, env.ENCRYPTION_KEY).toString() : undefined;

    // Store the encrypted tokens in the database
    const integrationResult = await IntegrationsRepository.upsertNotionToken(req.user.id, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      workspaceName: workspace_name,
      workspaceId: workspace_id,
      expiresAt: undefined, // Notion tokens don't expire by default
    });

    if (integrationResult.error) {
      logger.error('Failed to store Notion integration:', {
        userId: req.user.id,
        error: integrationResult.error,
      });

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?error=storage_failed`);
    }

    // Fetch additional workspace information if available
    if (access_token && workspace_id) {
      try {
        const notion = new Client({ auth: access_token });
        const workspace = await notion.users.me();
        
        logger.info('Notion OAuth completed successfully', {
          userId: req.user.id,
          workspaceId: workspace_id,
          workspaceName: workspace_name,
          ownerId: workspace.id,
        });
      } catch (workspaceError) {
        logger.warn('Failed to fetch Notion workspace info, but OAuth was successful', {
          userId: req.user.id,
          error: workspaceError,
        });
      }
    }

    // Redirect back to frontend with success
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?connected=notion&workspace=${encodeURIComponent(workspace_name || 'Unknown')}`);

  } catch (error) {
    logger.error('Unexpected error in Notion OAuth callback:', error);
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?error=unexpected_error`);
  }
});

/**
 * Get Notion integration status
 * GET /api/notion/status
 */
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const integration = await IntegrationsRepository.getNotionToken(req.user.id);

    if (integration.error || !integration.data) {
      return res.json({
        ok: true,
        data: {
          connected: false,
          workspace: null,
        },
      });
    }

    res.json({
      ok: true,
      data: {
        connected: true,
        workspace: {
          name: integration.data.workspace_name,
          id: integration.data.workspace_id,
        },
        lastUpdated: integration.data.updated_at,
      },
    });
  } catch (error) {
    logger.error('Error getting Notion integration status:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get integration status',
    });
  }
});

/**
 * Disconnect Notion integration
 * DELETE /api/notion/disconnect
 */
router.delete('/disconnect', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const result = await IntegrationsRepository.removeIntegration(req.user.id, 'notion');

    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    logger.info('Notion integration disconnected', {
      userId: req.user.id,
    });

    res.json({
      ok: true,
      data: {
        message: 'Notion integration disconnected successfully',
      },
    });
  } catch (error) {
    logger.error('Error disconnecting Notion integration:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to disconnect integration',
    });
  }
});

/**
 * Test Notion connection
 * POST /api/notion/test
 */
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const integration = await IntegrationsRepository.getNotionToken(req.user.id);

    if (integration.error || !integration.data) {
      return res.status(400).json({
        ok: false,
        error: 'Notion integration not found',
      });
    }

    // Decrypt the access token
    const decryptedAccessToken = CryptoJS.AES.decrypt(integration.data.access_token, env.ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);

    if (!decryptedAccessToken) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to decrypt access token',
      });
    }

    // Test the connection by fetching user info
    const notion = new Client({ auth: decryptedAccessToken });
    const user = await notion.users.me();

    logger.info('Notion connection test successful', {
      userId: req.user.id,
      notionUserId: user.id,
    });

    res.json({
      ok: true,
      data: {
        message: 'Connection test successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.person?.email,
        },
        workspace: {
          name: integration.data.workspace_name,
          id: integration.data.workspace_id,
        },
      },
    });
  } catch (error) {
    logger.error('Notion connection test failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as notionRouter };
