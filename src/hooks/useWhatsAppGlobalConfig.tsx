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
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState<WhatsAppGlobalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load global config (only admins can see full config)
  const fetchConfig = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Save global config (admin only)
  const saveConfig = useCallback(async (newConfig: Omit<WhatsAppGlobalConfig, 'id' | 'created_at' | 'updated_at' | 'admin_user_id'>) => {
    if (!isAdmin) return { error: 'Apenas administradores podem configurar' };

    try {
      setError(null);
      
      // Get current user ID for admin_user_id
      const { data: { user } } = await supabase.auth.getUser();
      
      if (config?.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('whatsapp_global_config')
          .update({
            api_url: newConfig.api_url,
            api_token: newConfig.api_token,
            is_active: newConfig.is_active,
            instance_name: newConfig.instance_name || null,
            admin_user_id: user?.id || config.admin_user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (updateError) {
          setError(updateError.message);
          return { error: updateError.message };
        }

        setConfig(prev => prev ? { ...prev, ...newConfig } : null);
      } else {
        // Insert new
        const { data, error: insertError } = await supabase
          .from('whatsapp_global_config')
          .insert({
            api_url: newConfig.api_url,
            api_token: newConfig.api_token,
            is_active: newConfig.is_active,
            instance_name: newConfig.instance_name || null,
            admin_user_id: user?.id,
          })
          .select()
          .single();

        if (insertError) {
          setError(insertError.message);
          return { error: insertError.message };
        }

        setConfig(data as WhatsAppGlobalConfig);
      }

      return { error: null };
    } catch (err: any) {
      console.error('Error saving WhatsApp global config:', err);
      setError(err.message);
      return { error: err.message };
    }
  }, [isAdmin, config?.id, config?.admin_user_id]);

  return {
    config,
    isLoading,
    error,
    saveConfig,
    refetch: fetchConfig,
    isApiActive: config?.is_active ?? false,
  };
}
