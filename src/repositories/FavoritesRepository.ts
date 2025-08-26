import { z } from 'zod';
import { supabase, Favorite, FavoriteInsert } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Zod schemas for input validation
export const ToggleFavoriteSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
});

export const FavoriteFiltersSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// Response types
export type ToggleFavoriteInput = z.infer<typeof ToggleFavoriteSchema>;
export type FavoriteFilters = z.infer<typeof FavoriteFiltersSchema>;

export class FavoritesRepository {
  /**
   * List favorites for a specific user
   */
  static async listForUser(userId: string, filters: FavoriteFilters = {}): Promise<{ data: Favorite[]; total: number; error?: string }> {
    try {
      const { data, error, count } = await supabase
        .from('favorites')
        .select(`
          *,
          templates (
            id,
            title,
            description,
            category,
            tags,
            is_public,
            usage_count,
            created_at,
            updated_at
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .range(filters.offset, filters.offset + filters.limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error listing favorites for user:', error);
        return { data: [], total: 0, error: error.message };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      logger.error('Unexpected error listing favorites for user:', error);
      return { data: [], total: 0, error: 'Internal server error' };
    }
  }

  /**
   * Toggle favorite status for a template
   */
  static async toggleFavorite(userId: string, templateId: string): Promise<{ 
    isFavorite: boolean; 
    error?: string;
    favoriteId?: string;
  }> {
    try {
      const validatedData = ToggleFavoriteSchema.parse({ templateId });

      // Check if the template exists and is accessible
      const { data: template, error: templateError } = await supabase
        .from('templates')
        .select('id, is_public, user_id')
        .eq('id', validatedData.templateId)
        .single();

      if (templateError) {
        if (templateError.code === 'PGRST116') {
          return { isFavorite: false, error: 'Template not found' };
        }
        logger.error('Error checking template existence:', templateError);
        return { isFavorite: false, error: templateError.message };
      }

      // Check if user can access this template (public or own)
      if (!template.is_public && template.user_id !== userId) {
        return { isFavorite: false, error: 'Template not accessible' };
      }

      // Check if already favorited
      const { data: existingFavorite, error: checkError } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('template_id', validatedData.templateId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Error checking existing favorite:', checkError);
        return { isFavorite: false, error: checkError.message };
      }

      if (existingFavorite) {
        // Remove from favorites
        const { error: deleteError } = await supabase
          .from('favorites')
          .delete()
          .eq('id', existingFavorite.id);

        if (deleteError) {
          logger.error('Error removing favorite:', deleteError);
          return { isFavorite: false, error: deleteError.message };
        }

        // Update template is_favorite flag
        await supabase
          .from('templates')
          .update({ is_favorite: false })
          .eq('id', validatedData.templateId);

        logger.info(`Favorite removed for template: ${validatedData.templateId}`);
        return { isFavorite: false };
      } else {
        // Add to favorites
        const favorite: FavoriteInsert = {
          user_id: userId,
          template_id: validatedData.templateId,
        };

        const { data: newFavorite, error: insertError } = await supabase
          .from('favorites')
          .insert(favorite)
          .select()
          .single();

        if (insertError) {
          logger.error('Error adding favorite:', insertError);
          return { isFavorite: false, error: insertError.message };
        }

        // Update template is_favorite flag
        await supabase
          .from('templates')
          .update({ is_favorite: true })
          .eq('id', validatedData.templateId);

        logger.info(`Favorite added for template: ${validatedData.templateId}`);
        return { 
          isFavorite: true, 
          favoriteId: newFavorite.id 
        };
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { isFavorite: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error('Unexpected error toggling favorite:', error);
      return { isFavorite: false, error: 'Internal server error' };
    }
  }

  /**
   * Check if a template is favorited by a user
   */
  static async isFavorited(userId: string, templateId: string): Promise<{ isFavorite: boolean; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('template_id', templateId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { isFavorite: false };
        }
        logger.error('Error checking favorite status:', error);
        return { isFavorite: false, error: error.message };
      }

      return { isFavorite: !!data };
    } catch (error) {
      logger.error('Unexpected error checking favorite status:', error);
      return { isFavorite: false, error: 'Internal server error' };
    }
  }

  /**
   * Get favorite count for a template
   */
  static async getFavoriteCount(templateId: string): Promise<{ count: number; error?: string }> {
    try {
      const { count, error } = await supabase
        .from('favorites')
        .select('*', { count: 'exact', head: true })
        .eq('template_id', templateId);

      if (error) {
        logger.error('Error getting favorite count:', error);
        return { count: 0, error: error.message };
      }

      return { count: count || 0 };
    } catch (error) {
      logger.error('Unexpected error getting favorite count:', error);
      return { count: 0, error: 'Internal server error' };
    }
  }

  /**
   * Remove all favorites for a user (useful for account deletion)
   */
  static async removeAllForUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId);

      if (error) {
        logger.error('Error removing all favorites for user:', error);
        return { success: false, error: error.message };
      }

      logger.info(`All favorites removed for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Unexpected error removing all favorites for user:', error);
      return { success: false, error: 'Internal server error' };
    }
  }
}
