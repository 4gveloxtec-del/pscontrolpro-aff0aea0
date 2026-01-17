import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabaseExternal as supabase } from '@/lib/supabase-external';

interface WhatsAppConfig {
  id?: string;
  user_id: string;
  api_url: string;
  api_token: string;
  instance_name: string;
  is_connected: boolean;
  auto_send_enabled: boolean;
  last_connection_check?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface NotificationRecord {
  id: string;
  client_id: string;
  seller_id: string;
  notification_type: string;
  expiration_cycle_date: string;
  sent_at: string;
  sent_via: string;
  service_type?: string;
  clients?: { name: string };
}

export function useWhatsAppConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load config from database
  const fetchConfig = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('whatsapp_api_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        if (fetchError.code === '42P01') {
          console.log('WhatsApp config table does not exist yet');
          setError('Tabela não existe. Execute o setup primeiro.');
        } else {
          console.error('Error fetching config:', fetchError);
          setError(fetchError.message);
        }
      } else if (data) {
        setConfig(data as WhatsAppConfig);
      }
    } catch (err: any) {
      console.error('Error fetching WhatsApp config:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Save config to database
  const saveConfig = useCallback(async (newConfig: Omit<WhatsAppConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user?.id) return { error: 'User not authenticated' };

    try {
      setError(null);
      
      if (config?.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('whatsapp_api_config')
          .update({
            api_url: newConfig.api_url,
            api_token: newConfig.api_token,
            instance_name: newConfig.instance_name,
            is_connected: newConfig.is_connected,
            auto_send_enabled: newConfig.auto_send_enabled,
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
          .from('whatsapp_api_config')
          .insert({
            user_id: user.id,
            api_url: newConfig.api_url,
            api_token: newConfig.api_token,
            instance_name: newConfig.instance_name,
            is_connected: newConfig.is_connected,
            auto_send_enabled: newConfig.auto_send_enabled,
          })
          .select()
          .single();

        if (insertError) {
          setError(insertError.message);
          return { error: insertError.message };
        }

        setConfig(data as WhatsAppConfig);
      }

      return { error: null };
    } catch (err: any) {
      console.error('Error saving WhatsApp config:', err);
      setError(err.message);
      return { error: err.message };
    }
  }, [user?.id, config?.id]);

  // Update connection status
  const updateConnectionStatus = useCallback(async (isConnected: boolean) => {
    if (!config?.id) return;

    try {
      await supabase
        .from('whatsapp_api_config')
        .update({
          is_connected: isConnected,
          last_connection_check: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

      setConfig(prev => prev ? { ...prev, is_connected: isConnected } : null);
    } catch (err) {
      console.error('Error updating connection status:', err);
    }
  }, [config?.id]);

  // Check if notification was already sent
  const wasNotificationSent = useCallback(async (
    clientId: string,
    notificationType: string,
    expirationDate: string
  ): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data } = await supabase
        .from('client_notification_tracking')
        .select('id')
        .eq('client_id', clientId)
        .eq('notification_type', notificationType)
        .eq('expiration_cycle_date', expirationDate)
        .maybeSingle();

      return !!data;
    } catch {
      return false;
    }
  }, [user?.id]);

  // Record that a notification was sent
  const recordNotificationSent = useCallback(async (
    clientId: string,
    notificationType: string,
    expirationDate: string,
    sentVia: string = 'manual'
  ) => {
    if (!user?.id) return;

    try {
      await supabase.from('client_notification_tracking').insert({
        client_id: clientId,
        seller_id: user.id,
        notification_type: notificationType,
        expiration_cycle_date: expirationDate,
        sent_via: sentVia,
      });
    } catch (err) {
      console.error('Error recording notification:', err);
    }
  }, [user?.id]);

  // Get sent notifications history
  const getSentNotifications = useCallback(async (limit = 100): Promise<NotificationRecord[]> => {
    if (!user?.id) return [];

    try {
      const { data } = await supabase
        .from('client_notification_tracking')
        .select('*, clients(name)')
        .eq('seller_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(limit);

      return (data || []) as unknown as NotificationRecord[];
    } catch {
      return [];
    }
  }, [user?.id]);

  return {
    config,
    isLoading,
    error,
    saveConfig,
    updateConnectionStatus,
    wasNotificationSent,
    recordNotificationSent,
    getSentNotifications,
    refetch: fetchConfig,
  };
}
