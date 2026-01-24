import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { createBackoffManager, type BackoffState } from '@/lib/exponentialBackoff';

interface ConnectionStatus {
  configured: boolean;
  connected: boolean;
  state?: string;
  instance_name?: string;
  last_heartbeat?: string;
  session_valid: boolean;
  needsQR?: boolean;
  blocked?: boolean;
  offline_since?: string | null;
  heartbeat_failures?: number;
}

interface ConnectionAlert {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
}

interface UseConnectionMonitorOptions {
  autoStart?: boolean;
  heartbeatInterval?: number; // in milliseconds
  onConnectionChange?: (connected: boolean) => void;
  onAlert?: (alert: ConnectionAlert) => void;
}

// Backoff configuration optimized for mobile battery
const MOBILE_BACKOFF_CONFIG = {
  baseDelayMs: 2000,      // Start with 2s
  maxDelayMs: 120000,     // Max 2 minutes
  maxAttempts: 8,         // Up to 8 retries
  jitterFactor: 0.4,      // 40% jitter for better distribution
  backoffFactor: 1.8,     // Slightly less aggressive than 2x
};

export function useConnectionMonitor(options: UseConnectionMonitorOptions = {}) {
  const { 
    autoStart = true, 
    heartbeatInterval = 60000, // default 1 minute
    onConnectionChange,
    onAlert,
  } = options;

  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [alerts, setAlerts] = useState<ConnectionAlert[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backoffState, setBackoffState] = useState<BackoffState | null>(null);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousConnectedRef = useRef<boolean | null>(null);
  const isMountedRef = useRef(true);
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);
  const backoffManagerRef = useRef(createBackoffManager(MOBILE_BACKOFF_CONFIG));
  const isRequestInFlightRef = useRef(false);

  // Check connection status via heartbeat with backoff protection
  const checkConnection = useCallback(async (silent = false) => {
    if (!user?.id) return null;
    
    // Prevent concurrent requests
    if (isRequestInFlightRef.current) {
      console.log('[ConnectionMonitor] Request already in flight, skipping');
      return null;
    }
    
    if (!silent) setIsChecking(true);
    setError(null);
    isRequestInFlightRef.current = true;

    try {
      const { data, error: fnError } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'check_single', seller_id: user.id },
      });

      if (fnError) throw fnError;

      if (!isMountedRef.current) return null;

      setStatus(data);
      setLastCheck(new Date());
      
      // Success - reset backoff
      backoffManagerRef.current.recordSuccess();
      setBackoffState(backoffManagerRef.current.getState());

      // Trigger callback if connection state changed
      if (previousConnectedRef.current !== null && 
          previousConnectedRef.current !== data.connected) {
        onConnectionChange?.(data.connected);
        
        // Show toast notification
        if (data.connected) {
          toast.success('WhatsApp reconectado automaticamente!');
        } else if (!data.session_valid) {
          toast.error('Sessão expirada. Escaneie o QR Code novamente.');
        }
      }
      previousConnectedRef.current = data.connected;

      return data;
    } catch (err: any) {
      if (!isMountedRef.current) return null;
      
      console.error('[ConnectionMonitor] Check error:', err);
      setError(err.message);
      
      // Record failure and schedule retry with exponential backoff
      backoffManagerRef.current.recordFailure();
      const currentBackoffState = backoffManagerRef.current.getState();
      setBackoffState(currentBackoffState);

      // Schedule retry with exponential backoff if we should retry
      if (backoffManagerRef.current.shouldRetry()) {
        const delay = backoffManagerRef.current.scheduleRetry(() => {
          if (isMountedRef.current && user?.id) {
            console.log('[ConnectionMonitor] Executing backoff retry...');
            checkConnection(true);
          }
        });
        
        if (delay) {
          console.log(`[ConnectionMonitor] Backoff: next retry in ${delay}ms (attempt ${currentBackoffState.attempt}/${MOBILE_BACKOFF_CONFIG.maxAttempts})`);
        }
      } else {
        console.log('[ConnectionMonitor] Max backoff attempts reached, waiting for next interval');
      }
      
      return null;
    } finally {
      isRequestInFlightRef.current = false;
      if (isMountedRef.current && !silent) {
        setIsChecking(false);
      }
    }
  }, [user?.id, onConnectionChange]);

  // Attempt manual reconnection
  const attemptReconnect = useCallback(async () => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };
    
    setIsReconnecting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'reconnect', seller_id: user.id },
      });

      if (fnError) throw fnError;

      if (data.success) {
        setStatus(prev => prev ? { ...prev, connected: true, session_valid: true } : null);
        toast.success('Reconectado com sucesso!');
        return { success: true, needsQR: false };
      }

      if (data.needsQR) {
        setStatus(prev => prev ? { ...prev, session_valid: false, needsQR: true } : null);
        toast.warning('Sessão expirada. É necessário escanear o QR Code.');
        return { success: false, needsQR: true };
      }

      toast.error('Falha ao reconectar. Tente novamente.');
      return { success: false, needsQR: false, error: data.error };
    } catch (err: any) {
      console.error('Reconnect error:', err);
      setError(err.message);
      toast.error('Erro ao tentar reconectar');
      return { success: false, error: err.message };
    } finally {
      setIsReconnecting(false);
    }
  }, [user?.id]);

  // Fetch alerts - uses ref to avoid stale closure issues
  const alertsRef = useRef<ConnectionAlert[]>([]);
  
  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error: fnError } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'get_alerts', seller_id: user.id },
      });

      if (fnError) throw fnError;

      if (!isMountedRef.current) return;

      const newAlerts = data.alerts || [];
      
      // Notify about new critical alerts - use ref to avoid dependency loop
      const previousAlertIds = alertsRef.current.map(a => a.id);
      const newCriticalAlerts = newAlerts.filter(
        (a: ConnectionAlert) => a.severity === 'critical' && !previousAlertIds.includes(a.id)
      );
      
      newCriticalAlerts.forEach((alert: ConnectionAlert) => {
        onAlert?.(alert);
        toast.error(alert.message);
      });

      alertsRef.current = newAlerts;
      setAlerts(newAlerts);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  }, [user?.id, onAlert]);

  // Start heartbeat monitoring
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    if (!isMountedRef.current) return;

    // Initial check
    checkConnection();
    fetchAlerts();

    // Set up interval with unmount check
    const intervalId = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(intervalId);
        return;
      }
      checkConnection(true); // silent check
    }, heartbeatInterval);
    
    intervalRef.current = intervalId;
    console.log(`Connection monitoring started (interval: ${heartbeatInterval}ms)`);
  }, [checkConnection, fetchAlerts, heartbeatInterval]);

  // Stop heartbeat monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('Connection monitoring stopped');
    }
  }, []);

  // Subscribe to realtime alerts
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('connection-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_alerts',
          filter: `seller_id=eq.${user.id}`,
        },
        (payload) => {
          const newAlert = payload.new as ConnectionAlert;
          setAlerts(prev => [newAlert, ...prev]);
          
          if (newAlert.severity === 'critical') {
            onAlert?.(newAlert);
            toast.error(newAlert.message);
          } else if (newAlert.severity === 'warning') {
            toast.warning(newAlert.message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, onAlert]);

  // Auto-start monitoring with proper cleanup
  useEffect(() => {
    isMountedRef.current = true;
    cleanupFunctionsRef.current = [];
    
    if (autoStart && user?.id) {
      startMonitoring();
    }

    return () => {
      console.log('[useConnectionMonitor] Cleanup completo executado');
      isMountedRef.current = false;
      stopMonitoring();
      
      // Cancel any pending backoff retries
      backoffManagerRef.current.cancelRetry();
      backoffManagerRef.current.reset();
      
      // Execute all tracked cleanup functions
      cleanupFunctionsRef.current.forEach(fn => {
        try {
          fn();
        } catch (e) {
          console.warn('[useConnectionMonitor] Cleanup error:', e);
        }
      });
      cleanupFunctionsRef.current = [];
    };
  }, [autoStart, user?.id, startMonitoring, stopMonitoring]);

  // Re-sync when tab becomes visible
  useEffect(() => {
    if (!user?.id) return;

    const handleVisibilityChange = () => {
      if (!isMountedRef.current) return;
      if (document.visibilityState === 'visible' && user?.id) {
        checkConnection(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const cleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    cleanupFunctionsRef.current.push(cleanup);
    
    return cleanup;
  }, [user?.id, checkConnection]);

  // Re-sync when coming back online
  useEffect(() => {
    if (!user?.id) return;

    const handleOnline = () => {
      if (!isMountedRef.current) return;
      if (user?.id) {
        toast.info('Conexão restaurada. Verificando WhatsApp...');
        checkConnection();
      }
    };

    window.addEventListener('online', handleOnline);
    
    const cleanup = () => {
      window.removeEventListener('online', handleOnline);
    };
    cleanupFunctionsRef.current.push(cleanup);
    
    return cleanup;
  }, [user?.id, checkConnection]);

  return {
    // State
    status,
    alerts,
    isChecking,
    isReconnecting,
    lastCheck,
    error,
    backoffState,
    
    // Computed
    isConnected: status?.connected ?? false,
    isConfigured: status?.configured ?? false,
    needsQR: status?.needsQR ?? false,
    sessionValid: status?.session_valid ?? true,
    offlineSince: status?.offline_since,
    isInBackoff: backoffState?.isRetrying ?? false,
    backoffAttempt: backoffState?.attempt ?? 0,
    
    // Actions
    checkConnection,
    attemptReconnect,
    fetchAlerts,
    startMonitoring,
    stopMonitoring,
    resetBackoff: () => {
      backoffManagerRef.current.reset();
      setBackoffState(backoffManagerRef.current.getState());
    },
    
    // Helpers
    getOfflineDuration: () => {
      if (!status?.offline_since) return null;
      const offlineSince = new Date(status.offline_since);
      const minutes = Math.round((Date.now() - offlineSince.getTime()) / 60000);
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.round(minutes / 60);
      return `${hours}h`;
    },
  };
}
