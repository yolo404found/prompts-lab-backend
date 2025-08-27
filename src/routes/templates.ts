import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Client } from '@notionhq/client';
import CryptoJS from 'crypto-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { authenticateToken, optionalAuth } from '@/middleware/auth';
import { TemplatesRepository } from '@/repositories/TemplatesRepository';
import { IntegrationsRepository } from '@/repositories/IntegrationsRepository';

const router = Router();

// Zod schemas for request validation
const CreateTemplateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  category: z.string().max(100, 'Category too long').optional(),
  tags: z.array(z.string().max(50)).max(10, 'Too many tags').optional(),
  content: z.record(z.any()).refine(
    (content) => content.prompt && content.variables,
    'Content must include prompt and variables'
  ),
  is_public: z.boolean().default(false),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

const SearchTemplatesSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

const ExportTemplateSchema = z.object({
  mode: z.enum(['page', 'database']),
  targetId: z.string().min(1, 'Target ID is required'),
  variables: z.record(z.string()),
});

const TemplateFiltersSchema = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

// Type definitions
type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
type SearchTemplatesInput = z.infer<typeof SearchTemplatesSchema>;
type ExportTemplateInput = z.infer<typeof ExportTemplateSchema>;
type TemplateFilters = z.infer<typeof TemplateFiltersSchema>;

/**
 * List public templates
 * GET /api/templates
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    // Parse and validate query parameters with defaults
    const filters: TemplateFilters = {
      limit: 20,
      offset: 0,
    };
    
    if (req.query.category) filters.category = String(req.query.category);
    if (req.query.tags) {
      const tagsParam = req.query.tags;
      filters.tags = Array.isArray(tagsParam) ? tagsParam : [String(tagsParam)];
    }
    if (req.query.is_public !== undefined) {
      filters.is_public = req.query.is_public === 'true';
    }
    if (req.query.limit) filters.limit = Number(req.query.limit);
    if (req.query.offset) filters.offset = Number(req.query.offset);

    // If user is authenticated, show both public and their own templates
    if (req.user) {
      console.log('🔍 Fetching templates for user:', req.user.id);
      console.log('🔍 Filters:', filters);
      
      const result = await TemplatesRepository.getByUserId(req.user.id, filters);
      console.log('🔍 User templates result:', { data: result.data?.length || 0, error: result.error });
      
      if (result.error) {
        return res.status(500).json({
          ok: false,
          error: result.error,
        });
      }

      // Also get public templates
      const publicResult = await TemplatesRepository.listPublic(filters);
      console.log('🔍 Public templates result:', { data: publicResult.data?.length || 0, total: publicResult.total, error: publicResult.error });
      
      if (publicResult.error) {
        return res.status(500).json({
          ok: false,
          error: publicResult.error,
        });
      }

      // Combine and deduplicate templates
      const allTemplates = [...result.data, ...publicResult.data];
      console.log('🔍 Combined templates before dedup:', allTemplates.length);
      
      const uniqueTemplates = allTemplates.filter((template, index, self) => 
        index === self.findIndex(t => t.id === template.id)
      );

      res.json({
        ok: true,
        data: {
          templates: uniqueTemplates,
          total: uniqueTemplates.length,
          userTemplates: result.data.length,
          publicTemplates: publicResult.data.length,
        },
      });
    } else {
      // Show only public templates for unauthenticated users
      const result = await TemplatesRepository.listPublic(filters);
      
      if (result.error) {
        return res.status(500).json({
          ok: false,
          error: result.error,
        });
      }

      res.json({
        ok: true,
        data: {
          templates: result.data,
          total: result.total,
          userTemplates: 0,
          publicTemplates: result.total,
        },
      });
    }
  } catch (error) {
    logger.error('Error listing templates:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to list templates',
    });
  }
});

/**
 * Get template by ID
 * GET /api/templates/:id
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    const result = await TemplatesRepository.getById(id);
    
    if (result.error) {
      return res.status(404).json({
        ok: false,
        error: result.error,
      });
    }

    if (!result.data) {
      return res.status(404).json({
        ok: false,
        error: 'Template not found',
      });
    }

    // Check if user can access this template
    if (!result.data.is_public && (!req.user || result.data.user_id !== req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: 'Access denied',
      });
    }

    res.json({
      ok: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Error getting template:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get template',
    });
  }
});

/**
 * Create new template
 * POST /api/templates
 */
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate request body
    const validatedData = CreateTemplateSchema.parse(req.body);
    
    const result = await TemplatesRepository.create(req.user.id, validatedData);
    
    if (result.error) {
      return res.status(400).json({
        ok: false,
        error: result.error,
      });
    }

    res.status(201).json({
      ok: true,
      data: result.data,
      message: 'Template created successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors.map(e => e.message),
      });
    }

    logger.error('Error creating template:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to create template',
    });
  }
});

/**
 * Update template
 * PATCH /api/templates/:id
 */
router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    // Validate request body
    const validatedData = UpdateTemplateSchema.parse(req.body);
    
    const result = await TemplatesRepository.update(id, req.user.id, validatedData);
    
    if (result.error) {
      if (result.error.includes('not found')) {
        return res.status(404).json({
          ok: false,
          error: result.error,
        });
      }
      if (result.error.includes('Unauthorized')) {
        return res.status(403).json({
          ok: false,
          error: result.error,
        });
      }
      return res.status(400).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: result.data,
      message: 'Template updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors.map(e => e.message),
      });
    }

    logger.error('Error updating template:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to update template',
    });
  }
});

/**
 * Delete template
 * DELETE /api/templates/:id
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    const result = await TemplatesRepository.delete(id, req.user.id);
    
    if (result.error) {
      if (result.error.includes('not found')) {
        return res.status(404).json({
          ok: false,
          error: result.error,
        });
      }
      if (result.error.includes('Unauthorized')) {
        return res.status(403).json({
          ok: false,
          error: result.error,
        });
      }
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to delete template',
    });
  }
});

/**
 * Search templates
 * GET /api/templates/search
 */
router.get('/search', optionalAuth, async (req: Request, res: Response) => {
  try {
    // Parse and validate query parameters
    const searchParams: SearchTemplatesInput = {
      query: String(req.query.query || ''),
      category: req.query.category ? String(req.query.category) : undefined,
      tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [String(req.query.tags)]) : undefined,
      is_public: req.query.is_public !== undefined ? req.query.is_public === 'true' : undefined,
      limit: Number(req.query.limit || 20),
      offset: Number(req.query.offset || 0),
    };

    const result = await TemplatesRepository.search(searchParams);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        templates: result.data,
        total: result.total,
        query: searchParams.query,
        filters: {
          category: searchParams.category,
          tags: searchParams.tags,
          is_public: searchParams.is_public,
        },
        pagination: {
          limit: searchParams.limit,
          offset: searchParams.offset,
          hasMore: result.total > searchParams.offset + searchParams.limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error searching templates:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to search templates',
    });
  }
});

/**
 * Export template to Notion
 * POST /api/templates/:id/export
 */
router.post('/:id/export', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid template ID',
      });
    }

    // Validate request body
    const exportData = ExportTemplateSchema.parse(req.body);

    // Get the template
    const templateResult = await TemplatesRepository.getById(id);
    
    if (templateResult.error || !templateResult.data) {
      return res.status(404).json({
        ok: false,
        error: 'Template not found',
      });
    }

    // Check if user can access this template
    if (!templateResult.data.is_public && templateResult.data.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: 'Access denied',
      });
    }

    // Get user's Notion integration
    const integrationResult = await IntegrationsRepository.getNotionToken(req.user.id);
    
    if (integrationResult.error || !integrationResult.data) {
      return res.status(400).json({
        ok: false,
        error: 'Notion integration not found. Please connect your Notion account first.',
      });
    }

    // Decrypt the access token
    const decryptedAccessToken = CryptoJS.AES.decrypt(
      integrationResult.data.access_token, 
      env.ENCRYPTION_KEY
    ).toString(CryptoJS.enc.Utf8);

    if (!decryptedAccessToken) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to decrypt access token',
      });
    }

    // Initialize Notion client
    const notion = new Client({ auth: decryptedAccessToken });

    // Interpolate variables into template content
    let interpolatedContent = templateResult.data.content.prompt;
    for (const [key, value] of Object.entries(exportData.variables)) {
      const placeholder = `{{${key}}}`;
      interpolatedContent = interpolatedContent.replace(new RegExp(placeholder, 'g'), value);
    }

    let notionResourceId: string;

    try {
      if (exportData.mode === 'page') {
        // Create a new page under the target page
        const pageResponse = await notion.pages.create({
          parent: { page_id: exportData.targetId },
          properties: {
            title: {
              title: [
                {
                  text: {
                    content: templateResult.data.title,
                  },
                },
              ],
            },
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: interpolatedContent,
                    },
                  },
                ],
              },
            },
          ],
        });

        notionResourceId = pageResponse.id;
      } else {
        // Create a new entry in the target database
        const databaseResponse = await notion.pages.create({
          parent: { database_id: exportData.targetId },
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: templateResult.data.title,
                  },
                },
              ],
            },
            Content: {
              rich_text: [
                {
                  text: {
                    content: interpolatedContent,
                  },
                },
              ],
            },
            Category: {
              select: {
                name: templateResult.data.category || 'Uncategorized',
              },
            },
            Tags: {
              multi_select: (templateResult.data.tags || []).map(tag => ({ name: tag })),
            },
          },
        });

        notionResourceId = databaseResponse.id;
      }

      // Increment usage count
      await TemplatesRepository.incrementUsageCount(id);

      logger.info('Template exported to Notion successfully', {
        userId: req.user.id,
        templateId: id,
        notionResourceId,
        mode: exportData.mode,
      });

      res.json({
        ok: true,
        data: {
          notionResourceId,
          mode: exportData.mode,
          message: 'Template exported successfully',
        },
      });
    } catch (notionError) {
      logger.error('Notion API error during export:', notionError);
      
      res.status(500).json({
        ok: false,
        error: 'Failed to export to Notion',
        details: notionError instanceof Error ? notionError.message : 'Unknown Notion API error',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors.map(e => e.message),
      });
    }

    logger.error('Error exporting template:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to export template',
    });
  }
});

/**
 * Get user's templates
 * GET /api/templates/my
 */
router.get('/my', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Parse and validate query parameters with defaults
    const filters: TemplateFilters = {
      limit: 20,
      offset: 0,
    };
    
    if (req.query.category) filters.category = String(req.query.category);
    if (req.query.tags) {
      const tagsParam = req.query.tags;
      filters.tags = Array.isArray(tagsParam) ? tagsParam : [String(tagsParam)];
    }
    if (req.query.is_public !== undefined) {
      filters.is_public = req.query.is_public === 'true';
    }
    if (req.query.limit) filters.limit = Number(req.query.limit);
    if (req.query.offset) filters.offset = Number(req.query.offset);

    const result = await TemplatesRepository.getByUserId(req.user.id, filters);
    
    if (result.error) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    res.json({
      ok: true,
      data: {
        templates: result.data,
        total: result.total,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.total > filters.offset + filters.limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting user templates:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get user templates',
    });
  }
});

export { router as templatesRouter };
