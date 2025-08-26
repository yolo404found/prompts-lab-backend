import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { authenticateToken } from '@/middleware/auth';
import { FavoritesRepository } from '@/repositories/FavoritesRepository';

const router = Router();

// Zod schemas for request validation
const ToggleFavoriteSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
});

const FavoriteFiltersSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

// Type definitions
type ToggleFavoriteInput = z.infer<typeof ToggleFavoriteSchema>;
type FavoriteFilters = z.infer<typeof FavoriteFiltersSchema>;

/**
 * Toggle favorite status for a template
 * POST /api/favorites/toggle
 */
router.post('/toggle', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate request body
    const validatedData = ToggleFavoriteSchema.parse(req.body);
    
    const result = await FavoritesRepository.toggleFavorite(req.user.id, validatedData.templateId);
    
    if (result.error) {
      return res.status(400).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        isFavorite: result.isFavorite,
        favoriteId: result.favoriteId,
        message: result.isFavorite ? 'Template added to favorites' : 'Template removed from favorites',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors.map(e => e.message),
      });
    }

    logger.error('Error toggling favorite:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to toggle favorite',
    });
  }
});

/**
 * List user's favorites
 * GET /api/favorites
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Parse and validate query parameters
    const filters: FavoriteFilters = {};
    
    if (req.query.limit) filters.limit = Number(req.query.limit);
    if (req.query.offset) filters.offset = Number(req.query.offset);

    const result = await FavoritesRepository.listForUser(req.user.id, filters);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        favorites: result.data,
        total: result.total,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.total > filters.offset + filters.limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error listing favorites:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to list favorites',
    });
  }
});

/**
 * Check if a template is favorited by the user
 * GET /api/favorites/check/:templateId
 */
router.get('/check/:templateId', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const { templateId } = req.params;
    
    if (!templateId || typeof templateId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    const result = await FavoritesRepository.isFavorited(req.user.id, templateId);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        isFavorite: result.isFavorite,
        templateId,
      },
    });
  } catch (error) {
    logger.error('Error checking favorite status:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to check favorite status',
    });
  }
});

/**
 * Get favorite count for a template
 * GET /api/favorites/count/:templateId
 */
router.get('/count/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    if (!templateId || typeof templateId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    const result = await FavoritesRepository.getFavoriteCount(templateId);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        count: result.count,
        templateId,
      },
    });
  } catch (error) {
    logger.error('Error getting favorite count:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get favorite count',
    });
  }
});

/**
 * Remove all favorites for the user
 * DELETE /api/favorites/clear
 */
router.delete('/clear', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const result = await FavoritesRepository.removeAllForUser(req.user.id);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    logger.info('All favorites cleared for user', {
      userId: req.user.id,
    });

    res.json({
      ok: true,
      data: {
        message: 'All favorites cleared successfully',
      },
    });
  } catch (error) {
    logger.error('Error clearing favorites:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to clear favorites',
    });
  }
});

/**
 * Get user's favorite templates with full template data
 * GET /api/favorites/templates
 */
router.get('/templates', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Parse and validate query parameters
    const filters: FavoriteFilters = {};
    
    if (req.query.limit) filters.limit = Number(req.query.limit);
    if (req.query.offset) filters.offset = Number(req.query.offset);

    const result = await FavoritesRepository.listForUser(req.user.id, filters);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    // Extract template data from favorites
    const templates = result.data.map(favorite => {
      const template = (favorite as any).templates;
      return {
        ...template,
        favoritedAt: favorite.created_at,
        favoriteId: favorite.id,
      };
    }).filter(template => template.id); // Filter out any undefined templates

    res.json({
      ok: true,
      data: {
        templates,
        total: templates.length,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.total > filters.offset + filters.limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting favorite templates:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get favorite templates',
    });
  }
});

export { router as favoritesRouter };
