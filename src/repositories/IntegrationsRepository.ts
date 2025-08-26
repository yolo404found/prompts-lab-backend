import { z } from 'zod';
import { supabase, UserIntegration, UserIntegrationInsert, UserIntegrationUpdate } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Zod schemas for input validation
export const UpsertNotionTokenSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  workspaceName: z.string().max(255, 'Workspace name too long').optional(),
  workspaceId: z.string().max(255, 'Workspace ID too long').optional(),
  expiresAt: z.string().datetime().optional(),
});

export const GetIntegrationSchema = z.object({
  provider: z.string().min(1, 'Provider is required').max(50, 'Provider name too long'),
});

// Response types
export type UpsertNotionTokenInput = z.infer<typeof UpsertNotionTokenSchema>;
export type GetIntegrationInput = z.infer<typeof GetIntegrationSchema>;

export class IntegrationsRepository {
  /**
   * Upsert Notion integration token for a user
   */
  static async upsertNotionToken(
    userId: string, 
    integrationData: UpsertNotionTokenInput
  ): Promise<{ data: UserIntegration | null; error?: string }> {
    try {
      const validatedData = UpsertNotionTokenSchema.parse(integrationData);

      // Check if integration already exists
      const { data: existingIntegration, error: checkError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'notion')
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Error checking existing Notion integration:', checkError);
        return { data: null, error: checkError.message };
      }

      let result;
      if (existingIntegration) {
        // Update existing integration
        const updateData: UserIntegrationUpdate = {
          access_token: validatedData.accessToken,
          refresh_token: validatedData.refreshToken || null,
          workspace_name: validatedData.workspaceName || null,
          workspace_id: validatedData.workspaceId || null,
          expires_at: validatedData.expiresAt || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('user_integrations')
          .update(updateData)
          .eq('id', existingIntegration.id)
          .select()
          .single();

        if (error) {
          logger.error('Error updating Notion integration:', error);
          return { data: null, error: error.message };
        }

        result = data;
        logger.info(`Notion integration updated for user: ${userId}`);
      } else {
        // Create new integration
        const newIntegration: UserIntegrationInsert = {
          user_id: userId,
          provider: 'notion',
          access_token: validatedData.accessToken,
          refresh_token: validatedData.refreshToken || null,
          workspace_name: validatedData.workspaceName || null,
          workspace_id: validatedData.workspaceId || null,
          expires_at: validatedData.expiresAt || null,
        };

        const { data, error } = await supabase
          .from('user_integrations')
          .insert(newIntegration)
          .select()
          .single();

        if (error) {
          logger.error('Error creating Notion integration:', error);
          return { data: null, error: error.message };
        }

        result = data;
        logger.info(`Notion integration created for user: ${userId}`);
      }

      return { data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { data: null, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error('Unexpected error upserting Notion token:', error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * Get Notion integration token for a user
   */
  static async getNotionToken(userId: string): Promise<{ data: UserIntegration | null; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'notion')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Notion integration not found' };
        }
        logger.error('Error getting Notion integration:', error);
        return { data: null, error: error.message };
      }

      return { data };
    } catch (error) {
      logger.error('Unexpected error getting Notion token:', error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * Get integration by provider for a user
   */
  static async getIntegration(
    userId: string, 
    provider: string
  ): Promise<{ data: UserIntegration | null; error?: string }> {
    try {
      const validatedData = GetIntegrationSchema.parse({ provider });

      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', validatedData.provider)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: `${provider} integration not found` };
        }
        logger.error(`Error getting ${provider} integration:`, error);
        return { data: null, error: error.message };
      }

      return { data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { data: null, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error(`Unexpected error getting ${provider} integration:`, error);
      return { data: null, error: 'Internal server error' };
    }
  }

  /**
   * List all integrations for a user
   */
  static async listForUser(userId: string): Promise<{ data: UserIntegration[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error listing user integrations:', error);
        return { data: [], error: error.message };
      }

      return { data: data || [] };
    } catch (error) {
      logger.error('Unexpected error listing user integrations:', error);
      return { data: [], error: 'Internal server error' };
    }
  }

  /**
   * Remove an integration for a user
   */
  static async removeIntegration(
    userId: string, 
    provider: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validatedData = GetIntegrationSchema.parse({ provider });

      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', userId)
        .eq('provider', validatedData.provider);

      if (error) {
        logger.error(`Error removing ${provider} integration:`, error);
        return { success: false, error: error.message };
      }

      logger.info(`${provider} integration removed for user: ${userId}`);
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error(`Unexpected error removing ${provider} integration:`, error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Check if a user has a specific integration
   */
  static async hasIntegration(
    userId: string, 
    provider: string
  ): Promise<{ hasIntegration: boolean; error?: string }> {
    try {
      const validatedData = GetIntegrationSchema.parse({ provider });

      const { data, error } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', validatedData.provider)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { hasIntegration: false };
        }
        logger.error(`Error checking ${provider} integration:`, error);
        return { hasIntegration: false, error: error.message };
      }

      return { hasIntegration: !!data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { hasIntegration: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error(`Unexpected error checking ${provider} integration:`, error);
      return { hasIntegration: false, error: 'Internal server error' };
    }
  }

  /**
   * Update integration expiration
   */
  static async updateExpiration(
    userId: string, 
    provider: string, 
    expiresAt: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validatedData = GetIntegrationSchema.parse({ provider });

      const { error } = await supabase
        .from('user_integrations')
        .update({ 
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('provider', validatedData.provider);

      if (error) {
        logger.error(`Error updating ${provider} integration expiration:`, error);
        return { success: false, error: error.message };
      }

      logger.info(`${provider} integration expiration updated for user: ${userId}`);
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      logger.error(`Unexpected error updating ${provider} integration expiration:`, error);
      return { success: false, error: 'Internal server error' };
    }
  }
}
