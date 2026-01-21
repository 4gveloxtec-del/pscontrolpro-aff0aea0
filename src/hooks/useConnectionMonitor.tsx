import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousConnectedRef = useRef<boolean | null>(null);
  const isMountedRef = useRef(true);

  // Check connection status via heartbeat
  const checkConnection = useCallback(async (silent = false) => {
    if (!user?.id) return null;
    
    if (!silent) setIsChecking(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'check_single', seller_id: user.id },
      });

      if (fnError) throw fnError;

      if (!isMountedRef.current) return null;

      setStatus(data);
      setLastCheck(new Date());

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
      
      console.error('Connection check error:', err);
      setError(err.message);
      return null;
    } finally {
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

    // Initial check
    checkConnection();
    fetchAlerts();

    // Set up interval
    intervalRef.current = setInterval(() => {
      checkConnection(true); // silent check
    }, heartbeatInterval);

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

  // Auto-start monitoring
  useEffect(() => {
    isMountedRef.current = true;
    
    if (autoStart && user?.id) {
      startMonitoring();
    }

    return () => {
      isMountedRef.current = false;
      stopMonitoring();
    };
  }, [autoStart, user?.id, startMonitoring, stopMonitoring]);

  // Re-sync when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.id) {
        // Re-check connection when user returns to tab
        checkConnection(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, checkConnection]);

  // Re-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (user?.id) {
        toast.info('Conexão restaurada. Verificando WhatsApp...');
        checkConnection();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.id, checkConnection]);

  return {
    // State
    status,
    alerts,
    isChecking,
    isReconnecting,
    lastCheck,
    error,
    
    // Computed
    isConnected: status?.connected ?? false,
    isConfigured: status?.configured ?? false,
    needsQR: status?.needsQR ?? false,
    sessionValid: status?.session_valid ?? true,
    offlineSince: status?.offline_since,
    
    // Actions
    checkConnection,
    attemptReconnect,
    fetchAlerts,
    startMonitoring,
    stopMonitoring,
    
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
