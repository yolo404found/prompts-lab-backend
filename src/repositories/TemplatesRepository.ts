import { z } from 'zod';
import { supabase, Template, TemplateInsert, TemplateUpdate } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Zod schemas for input validation
export const CreateTemplateSchema = z.object({
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

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export const SearchTemplatesSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const TemplateFiltersSchema = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  user_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// Response types
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type SearchTemplatesInput = z.infer<typeof SearchTemplatesSchema>;
export type TemplateFilters = z.infer<typeof TemplateFiltersSchema>;

export class TemplatesRepository {
  /**
   * List public templates with optional filtering
   */
  static async listPublic(filters: TemplateFilters = {}): Promise<{ data: Template[]; total: number; error?: string }> {
    try {
      console.log('🔍 listPublic called with filters:', filters);
      
      let query = supabase
        .from('templates')
        .select('*', { count: 'exact' })
        .eq('is_public', true);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      console.log('🔍 About to execute query with range:', filters.offset, 'to', filters.offset + filters.limit - 1);
      
      const { data, error, count } = await query
        .range(filters.offset, filters.offset + filters.limit - 1)
        .order('created_at', { ascending: false });

      console.log('🔍 Query result:', { dataLength: data?.length || 0, count, error: error?.message });

      if (error) {
        logger.error('Error listing public templates:', error);
        return { data: [], total: 0, error: error.message };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      logger.error('Unexpected error listing public templates:', error);
      return { data: [], total: 0, error: 'Internal server error' };
    }
  }

  /**
   * Get template by ID
   */
  static async getById(id: string): Promise<{ data: Template | null; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Template not found' };
        }
        logger.error('Error getting template by ID:', error);
        return { data: null, error: error.message };
      }

      return { data };
    } catch (error) {
      logger.error('Unexpected error getting template by ID:', error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * Create new template
   */
  static async create(userId: string, templateData: CreateTemplateInput): Promise<{ data: Template | null; error?: string }> {
    try {
      const validatedData = CreateTemplateSchema.parse(templateData);
      
      const template: TemplateInsert = {
        ...validatedData,
        user_id: userId,
        usage_count: 0,
      };

      const { data, error } = await supabase
        .from('templates')
        .insert(template)
        .select()
        .single();

      if (error) {
        logger.error('Error creating template:', error);
        return { data: null, error: error.message };
      }

      logger.info(`Template created successfully: ${data.id}`);
      return { data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { data: null, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error('Unexpected error creating template:', error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * Update existing template
   */
  static async update(id: string, userId: string, templateData: UpdateTemplateInput): Promise<{ data: Template | null; error?: string }> {
    try {
      // First verify the template belongs to the user
      const { data: existingTemplate, error: fetchError } = await supabase
        .from('templates')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return { data: null, error: 'Template not found' };
        }
        logger.error('Error fetching template for update:', fetchError);
        return { data: null, error: fetchError.message };
      }

      if (existingTemplate.user_id !== userId) {
        return { data: null, error: 'Unauthorized: Template does not belong to user' };
      }

      const validatedData = UpdateTemplateSchema.parse(templateData);
      
      const { data, error } = await supabase
        .from('templates')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating template:', error);
        return { data: null, error: error.message };
      }

      logger.info(`Template updated successfully: ${id}`);
      return { data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { data: null, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error('Unexpected error updating template:', error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * Delete template
   */
  static async delete(id: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First verify the template belongs to the user
      const { data: existingTemplate, error: fetchError } = await supabase
        .from('templates')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return { success: false, error: 'Template not found' };
        }
        logger.error('Error fetching template for deletion:', fetchError);
        return { success: false, error: fetchError.message };
      }

      if (existingTemplate.user_id !== userId) {
        return { success: false, error: 'Unauthorized: Template does not belong to user' };
      }

      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting template:', error);
        return { success: false, error: error.message };
      }

      logger.info(`Template deleted successfully: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Unexpected error deleting template:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Search templates by query, category, and tags
   */
  static async search(searchParams: SearchTemplatesInput): Promise<{ data: Template[]; total: number; error?: string }> {
    try {
      const validatedParams = SearchTemplatesSchema.parse(searchParams);
      
      let query = supabase
        .from('templates')
        .select('*', { count: 'exact' });

      // Apply search filters
      if (validatedParams.is_public !== undefined) {
        query = query.eq('is_public', validatedParams.is_public);
      }

      if (validatedParams.category) {
        query = query.eq('category', validatedParams.category);
      }

      if (validatedParams.tags && validatedParams.tags.length > 0) {
        query = query.overlaps('tags', validatedParams.tags);
      }

      // Full-text search on title, description, and content
      if (validatedParams.query) {
        query = query.or(`title.ilike.%${validatedParams.query}%,description.ilike.%${validatedParams.query}%`);
      }

      const { data, error, count } = await query
        .range(validatedParams.offset, validatedParams.offset + validatedParams.limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error searching templates:', error);
        return { data: [], total: 0, error: error.message };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { data: [], total: 0, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error('Unexpected error searching templates:', error);
      return { data: [], total: 0, error: 'Internal server error' };
    }
  }

  /**
   * Get templates by user ID
   */
  static async getByUserId(userId: string, filters: TemplateFilters = {}): Promise<{ data: Template[]; total: number; error?: string }> {
    try {
      console.log('🔍 getByUserId called with userId:', userId, 'filters:', filters);
      
      let query = supabase
        .from('templates')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      console.log('🔍 About to execute getByUserId query with range:', filters.offset, 'to', filters.offset + filters.limit - 1);
      
      const { data, error, count } = await query
        .range(filters.offset, filters.offset + filters.limit - 1)
        .order('created_at', { ascending: false });

      console.log('🔍 getByUserId query result:', { dataLength: data?.length || 0, count, error: error?.message });

      if (error) {
        logger.error('Error getting templates by user ID:', error);
        return { data: [], total: 0, error: error.message };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      logger.error('Unexpected error getting templates by user ID:', error);
      return { data: [], total: 0, error: 'Internal server error' };
    }
  }

  /**
   * Increment usage count for a template
   */
  static async incrementUsageCount(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('templates')
        .update({ usage_count: supabase.rpc('increment_usage_count') })
        .eq('id', id);

      if (error) {
        logger.error('Error incrementing usage count:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      logger.error('Unexpected error incrementing usage count:', error);
      return { success: false, error: 'Internal server error' };
    }
  }
}
