import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface WhatsAppGlobalConfig {
  id?: string;
  api_url: string;
  api_token: string;
  is_active: boolean;
  instance_name?: string | null;
  admin_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function useWhatsAppGlobalConfig() {
  const { isAdmin, user } = useAuth();
  const [config, setConfig] = useState<WhatsAppGlobalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load global config (admin only). Non-admin MUST NOT load/track global WhatsApp config.
  const fetchConfig = useCallback(async () => {
    if (!isAdmin) {
      setConfig(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .maybeSingle();

      if (fetchError) {
        if (fetchError.code === '42P01') {
          console.log('WhatsApp global config table does not exist yet');
          setError('Tabela não existe. Execute a migração primeiro.');
        } else if (fetchError.code === '42501') {
          // Permission denied - user is not admin
          setError(null);
        } else {
          console.error('Error fetching global config:', fetchError);
          setError(fetchError.message);
        }
      } else if (data) {
        setConfig(data as WhatsAppGlobalConfig);
      }
    } catch (err: any) {
      console.error('Error fetching WhatsApp global config:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Save global config (admin only)
  const saveConfig = useCallback(async (newConfig: Omit<WhatsAppGlobalConfig, 'id' | 'created_at' | 'updated_at' | 'admin_user_id'>) => {
    if (!isAdmin) return { error: 'Apenas administradores podem configurar' };

    try {
      setError(null);
      
      // Get current user ID for admin_user_id
      const currentUserId = user?.id;
      
      if (!currentUserId) {
        return { error: 'Usuário não autenticado' };
      }
      
      // Normalize the instance_name - trim whitespace and lowercase for consistency
      const normalizedInstanceName = newConfig.instance_name?.trim() || null;
      
      if (config?.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('whatsapp_global_config')
          .update({
            api_url: newConfig.api_url.trim(),
            api_token: newConfig.api_token.trim(),
            is_active: newConfig.is_active,
            instance_name: normalizedInstanceName,
            admin_user_id: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (updateError) {
          console.error('Error updating global config:', updateError);
          setError(updateError.message);
          return { error: updateError.message };
        }

        // Update local state
        setConfig(prev => prev ? { 
          ...prev, 
          ...newConfig, 
          instance_name: normalizedInstanceName,
          admin_user_id: currentUserId 
        } : null);
        
        console.log('[GlobalConfig] Updated successfully with instance_name:', normalizedInstanceName);
      } else {
        // Insert new
        const { data, error: insertError } = await supabase
          .from('whatsapp_global_config')
          .insert({
            api_url: newConfig.api_url.trim(),
            api_token: newConfig.api_token.trim(),
            is_active: newConfig.is_active,
            instance_name: normalizedInstanceName,
            admin_user_id: currentUserId,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting global config:', insertError);
          setError(insertError.message);
          return { error: insertError.message };
        }

        setConfig(data as WhatsAppGlobalConfig);
        console.log('[GlobalConfig] Created successfully with instance_name:', normalizedInstanceName);
      }

      return { error: null };
    } catch (err: any) {
      console.error('Error saving WhatsApp global config:', err);
      setError(err.message);
      return { error: err.message };
    }
  }, [isAdmin, user?.id, config?.id]);

  return {
    config,
    isLoading,
    error,
    saveConfig,
    refetch: fetchConfig,
    isApiActive: config?.is_active ?? false,
    adminInstanceName: config?.instance_name || null,
  };
}
