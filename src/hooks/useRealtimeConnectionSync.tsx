import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnce } from '@/hooks/useOnce';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ConnectionState {
  configured: boolean;
  connected: boolean;
  state: 'connected' | 'disconnected' | 'reconnecting' | 'checking' | 'needs_qr';
  instance_name?: string;
  last_heartbeat?: string;
  session_valid: boolean;
  offline_since?: string | null;
  heartbeat_failures?: number;
  evolution_state?: string;
  connected_phone?: string;
}

interface UseRealtimeConnectionSyncOptions {
  heartbeatInterval?: number; // in seconds
  enableAutoHealing?: boolean;
  onStatusChange?: (state: ConnectionState) => void;
}

/**
 * Hook para sincronização em tempo real do status de conexão.
 * 
 * Características:
 * - Fonte única da verdade: sempre consulta o backend
 * - Heartbeat automático configurável
 * - Detecção de reconexão após queda
 * - Auto-healing quando a conexão volta
 * - Realtime updates via Supabase
 * - Cleanup robusto para evitar memory leaks
 */
export function useRealtimeConnectionSync(options: UseRealtimeConnectionSyncOptions = {}) {
  const {
    heartbeatInterval = 60, // 60 seconds default (optimized for mobile battery)
    enableAutoHealing = true,
    onStatusChange,
  } = options;

  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    configured: false,
    connected: false,
    state: 'checking',
    session_valid: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousConnectedRef = useRef<boolean | null>(null);
  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  // Sync status from backend (source of truth)
  const syncStatusFromBackend = useCallback(async (silent = false) => {
    if (!user?.id) return null;

    if (!silent) setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'check_single', seller_id: user.id },
      });

      if (error) throw error;
      if (!isMountedRef.current) return null;

      const newState: ConnectionState = {
        configured: data.configured ?? false,
        connected: data.connected ?? false,
        state: determineState(data),
        instance_name: data.instance_name,
        last_heartbeat: data.last_heartbeat,
        session_valid: data.session_valid ?? true,
        offline_since: data.offline_since,
        heartbeat_failures: data.heartbeat_failures,
        evolution_state: data.state,
        connected_phone: data.connected_phone,
      };

      setConnectionState(newState);
      setLastSyncTime(new Date());
      retryCountRef.current = 0;

      // Notify about connection changes
      if (previousConnectedRef.current !== null && previousConnectedRef.current !== newState.connected) {
        onStatusChange?.(newState);
        
        if (newState.connected && enableAutoHealing) {
          toast.success('WhatsApp reconectado automaticamente!', {
            description: 'A conexão foi restaurada.',
            duration: 4000,
          });
        }
      }
      
      previousConnectedRef.current = newState.connected;
      return newState;
    } catch (err: any) {
      console.error('Sync error:', err);
      retryCountRef.current++;

      if (!isMountedRef.current) return null;

      // Don't mark as disconnected on temporary frontend failures
      if (retryCountRef.current < 3) {
        setConnectionState(prev => ({
          ...prev,
          state: 'checking',
        }));
      }

      return null;
    } finally {
      if (isMountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, [user?.id, enableAutoHealing, onStatusChange]);

  // Determine visual state from data
  function determineState(data: any): ConnectionState['state'] {
    if (!data.configured) return 'disconnected';
    if (data.connected) return 'connected';
    if (!data.session_valid) return 'needs_qr';
    if ((data.heartbeat_failures || 0) > 0 && (data.heartbeat_failures || 0) < 5) return 'reconnecting';
    return 'disconnected';
  }

  // Manual reconnect attempt
  const attemptReconnect = useCallback(async () => {
    if (!user?.id) return { success: false };

    setConnectionState(prev => ({ ...prev, state: 'reconnecting' }));

    try {
      const { data, error } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'reconnect', seller_id: user.id },
      });

      if (error) throw error;

      if (data.success) {
        await syncStatusFromBackend();
        toast.success('Reconectado com sucesso!');
        return { success: true, needsQR: false };
      }

      if (data.needsQR) {
        setConnectionState(prev => ({
          ...prev,
          state: 'needs_qr',
          session_valid: false,
        }));
        toast.warning('Sessão expirada. Escaneie o QR Code novamente.');
        return { success: false, needsQR: true };
      }

      await syncStatusFromBackend();
      return { success: false, needsQR: false, error: data.error };
    } catch (err: any) {
      console.error('Reconnect error:', err);
      toast.error('Falha ao reconectar');
      return { success: false, error: err.message };
    }
  }, [user?.id, syncStatusFromBackend]);

  // Force sync (manual refresh)
  const forceSync = useCallback(() => {
    return syncStatusFromBackend(false);
  }, [syncStatusFromBackend]);

  // Start heartbeat loop
  const startHeartbeat = useCallback(() => {
    if (intervalRef.current) return;
    if (!isMountedRef.current) return;

    // Initial sync
    syncStatusFromBackend();

    // Set up interval with cleanup tracking
    const intervalId = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(intervalId);
        return;
      }
      syncStatusFromBackend(true); // Silent checks
    }, heartbeatInterval * 1000);
    
    intervalRef.current = intervalId;
    console.log(`[Connection] Heartbeat started (${heartbeatInterval}s interval)`);
  }, [syncStatusFromBackend, heartbeatInterval]);

  // Stop heartbeat loop
  const stopHeartbeat = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('[Connection] Heartbeat stopped');
    }
  }, []);

  // Subscribe to realtime instance changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`instance-status-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_seller_instances',
          filter: `seller_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Connection] Realtime update:', payload.new);
          
          const newData = payload.new as any;
          const newState: ConnectionState = {
            configured: true,
            connected: newData.is_connected ?? false,
            state: newData.is_connected 
              ? 'connected' 
              : newData.session_valid === false 
                ? 'needs_qr' 
                : 'disconnected',
            instance_name: newData.instance_name,
            last_heartbeat: newData.last_heartbeat_at,
            session_valid: newData.session_valid ?? true,
            offline_since: newData.offline_since,
            heartbeat_failures: newData.heartbeat_failures,
            evolution_state: newData.last_evolution_state,
            connected_phone: newData.connected_phone,
          };

          setConnectionState(prev => {
            // Auto-healing notification
            if (!prev.connected && newState.connected && enableAutoHealing) {
              toast.success('WhatsApp reconectado!', {
                description: 'A conexão foi restaurada automaticamente.',
              });
            }
            return newState;
          });

          onStatusChange?.(newState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, enableAutoHealing, onStatusChange]);

  // Handle visibility change (re-sync when tab becomes visible)
  useEffect(() => {
    if (!user?.id) return;

    const handleVisibilityChange = () => {
      if (!isMountedRef.current) return;
      if (document.visibilityState === 'visible' && user?.id) {
        console.log('[Connection] Tab visible, syncing...');
        syncStatusFromBackend(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Track cleanup function
    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    cleanupFunctionsRef.current.push(cleanup);
    
    return cleanup;
  }, [user?.id, syncStatusFromBackend]);

  // Handle online/offline events
  useEffect(() => {
    if (!user?.id) return;

    const handleOnline = () => {
      if (!isMountedRef.current) return;
      if (user?.id) {
        console.log('[Connection] Browser online, syncing...');
        toast.info('Conexão restaurada. Verificando WhatsApp...');
        syncStatusFromBackend();
      }
    };

    const handleOffline = () => {
      if (!isMountedRef.current) return;
      console.log('[Connection] Browser offline');
      setConnectionState(prev => ({
        ...prev,
        state: 'reconnecting',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const cleanup = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    cleanupFunctionsRef.current.push(cleanup);
    
    return cleanup;
  }, [user?.id, syncStatusFromBackend]);

  // Initialize and cleanup - runs only once
  useOnce(() => {
    console.log('[useRealtimeConnectionSync] Inicialização única executada');
    isMountedRef.current = true;
    cleanupFunctionsRef.current = [];

    if (user?.id) {
      startHeartbeat();
    }

    return () => {
      console.log('[useRealtimeConnectionSync] Cleanup completo executado');
      isMountedRef.current = false;
      
      // Stop heartbeat
      stopHeartbeat();
      
      // Execute all tracked cleanup functions
      cleanupFunctionsRef.current.forEach(fn => {
        try {
          fn();
        } catch (e) {
          console.warn('[useRealtimeConnectionSync] Cleanup error:', e);
        }
      });
      cleanupFunctionsRef.current = [];
    };
  });

  // Calculate offline duration
  const getOfflineDuration = useCallback(() => {
    if (!connectionState.offline_since) return null;
    
    const offlineSince = new Date(connectionState.offline_since);
    const minutes = Math.round((Date.now() - offlineSince.getTime()) / 60000);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes} min`;
    
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    
    const days = Math.round(hours / 24);
    return `${days}d`;
  }, [connectionState.offline_since]);

  return {
    // State
    ...connectionState,
    isLoading,
    lastSyncTime,
    
    // Computed
    isConnected: connectionState.connected,
    isConfigured: connectionState.configured,
    needsQR: connectionState.state === 'needs_qr',
    isReconnecting: connectionState.state === 'reconnecting',
    isChecking: connectionState.state === 'checking',
    offlineDuration: getOfflineDuration(),
    
    // Actions
    syncStatus: forceSync,
    attemptReconnect,
    startHeartbeat,
    stopHeartbeat,
  };
}
