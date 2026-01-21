import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useOnce } from '@/hooks/useOnce';

interface WhatsAppSellerInstance {
  id?: string;
  seller_id: string;
  instance_name: string;
  is_connected: boolean;
  auto_send_enabled: boolean;
  last_connection_check?: string | null;
  last_heartbeat_at?: string | null;
  created_at?: string;
  updated_at?: string;
  plan_status?: 'active' | 'trial' | 'expired' | 'suspended';
  plan_expires_at?: string | null;
  instance_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  session_valid?: boolean;
  last_evolution_state?: string | null;
  webhook_auto_configured?: boolean;
  connected_phone?: string | null;
}

export function useWhatsAppSellerInstance() {
  const { user } = useAuth();
  const [instance, setInstance] = useState<WhatsAppSellerInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Load seller instance
  const fetchInstance = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle();

      if (!isMountedRef.current) return;

      if (fetchError) {
        if (fetchError.code === '42P01') {
          console.log('WhatsApp seller instances table does not exist yet');
          setError('Tabela não existe.');
        } else {
          console.error('Error fetching seller instance:', fetchError);
          setError(fetchError.message);
        }
      } else if (data) {
        setInstance(data as WhatsAppSellerInstance);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Error fetching WhatsApp seller instance:', err);
      setError(err.message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  // Initial fetch - runs only once
  useOnce(() => {
    console.log('[useWhatsAppSellerInstance] Inicialização única executada');
    isMountedRef.current = true;
    fetchInstance();
    
    return () => {
      console.log('[useWhatsAppSellerInstance] Cleanup executado');
      isMountedRef.current = false;
    };
  });

  // Subscribe to realtime updates - auto-update when instance changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`seller-instance-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_seller_instances',
          filter: `seller_id=eq.${user.id}`,
        },
        (payload) => {
          if (!isMountedRef.current) return;
          
          if (payload.eventType === 'DELETE') {
            setInstance(null);
          } else {
            const newData = payload.new as WhatsAppSellerInstance;
            setInstance(prev => {
              // Only update if data actually changed
              if (JSON.stringify(prev) !== JSON.stringify(newData)) {
                return newData;
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Save seller instance
  const saveInstance = useCallback(async (newInstance: Pick<WhatsAppSellerInstance, 'instance_name' | 'auto_send_enabled'>) => {
    if (!user?.id) return { error: 'User not authenticated' };

    try {
      setError(null);
      
      if (instance?.id) {
        const { error: updateError } = await supabase
          .from('whatsapp_seller_instances')
          .update({
            instance_name: newInstance.instance_name,
            auto_send_enabled: newInstance.auto_send_enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', instance.id);

        if (updateError) {
          setError(updateError.message);
          return { error: updateError.message };
        }
        // Realtime will update the state
      } else {
        const { error: insertError } = await supabase
          .from('whatsapp_seller_instances')
          .insert({
            seller_id: user.id,
            instance_name: newInstance.instance_name,
            auto_send_enabled: newInstance.auto_send_enabled,
            is_connected: false,
          });

        if (insertError) {
          setError(insertError.message);
          return { error: insertError.message };
        }
        // Realtime will update the state
      }

      return { error: null };
    } catch (err: any) {
      console.error('Error saving WhatsApp seller instance:', err);
      setError(err.message);
      return { error: err.message };
    }
  }, [user?.id, instance?.id]);

  // Update connection status
  const updateConnectionStatus = useCallback(async (isConnected: boolean) => {
    if (!instance?.id) return;

    try {
      await supabase
        .from('whatsapp_seller_instances')
        .update({
          is_connected: isConnected,
          last_connection_check: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id);
      // Realtime will update the state
    } catch (err) {
      console.error('Error updating connection status:', err);
    }
  }, [instance?.id]);

  const isBlocked = instance?.instance_blocked === true;
  const blockedReason = instance?.blocked_reason || 'Plano vencido - inadimplência';

  return {
    instance,
    isLoading,
    error,
    isBlocked,
    blockedReason,
    saveInstance,
    updateConnectionStatus,
    refetch: fetchInstance,
  };
}
