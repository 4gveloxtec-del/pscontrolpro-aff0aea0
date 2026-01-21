import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOnce } from '@/hooks/useOnce';

interface HealthConfig {
  id: string;
  is_enabled: boolean;
  check_interval_seconds: number;
  auto_repair_enabled: boolean;
  max_repair_attempts: number;
  notify_admin_on_critical: boolean;
}

interface HealthStatus {
  id: string;
  component_name: string;
  component_type: string;
  status: 'healthy' | 'warning' | 'critical' | 'recovering' | 'unknown';
  last_check_at: string;
  last_error: string | null;
  consecutive_failures: number;
  repair_attempts: number;
  last_repair_at: string | null;
  last_repair_success: boolean | null;
  metadata: Record<string, unknown>;
}

interface HealthLog {
  id: string;
  component_name: string;
  event_type: string;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  repair_action: string | null;
  was_auto_repaired: boolean;
  created_at: string;
}

export function useSystemHealth() {
  const [config, setConfig] = useState<HealthConfig | null>(null);
  const [statuses, setStatuses] = useState<HealthStatus[]>([]);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [configResult, statusResult, logsResult] = await Promise.all([
        supabase.from('system_health_config').select('*').single(),
        supabase.from('system_health_status').select('*').order('component_name'),
        supabase.from('system_health_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (configResult.data) {
        setConfig(configResult.data as HealthConfig);
      }

      if (statusResult.data) {
        setStatuses(statusResult.data as HealthStatus[]);
      }

      if (logsResult.data) {
        setLogs(logsResult.data as HealthLog[]);
      }
    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch - runs only once per session
  useOnce(() => {
    console.log('[useSystemHealth] Inicialização única executada');
    fetchData();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => {
      console.log('[useSystemHealth] Cleanup executado');
      clearInterval(interval);
    };
  });

  const toggleSystem = async (enabled: boolean) => {
    if (!config) return;

    try {
      const { error } = await supabase
        .from('system_health_config')
        .update({ is_enabled: enabled })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, is_enabled: enabled });
      toast({
        title: enabled ? 'Sistema Ativado' : 'Sistema Desativado',
        description: enabled 
          ? 'O sistema de autocura está agora monitorando o aplicativo.'
          : 'O sistema de autocura foi desativado.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o estado do sistema.',
        variant: 'destructive',
      });
    }
  };

  const toggleAutoRepair = async (enabled: boolean) => {
    if (!config) return;

    try {
      const { error } = await supabase
        .from('system_health_config')
        .update({ auto_repair_enabled: enabled })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, auto_repair_enabled: enabled });
      toast({
        title: enabled ? 'Reparo Automático Ativado' : 'Reparo Automático Desativado',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar a configuração.',
        variant: 'destructive',
      });
    }
  };

  const runManualCheck = async () => {
    setIsRunningCheck(true);
    try {
      const { data, error } = await supabase.functions.invoke('self-healing');

      if (error) throw error;

      toast({
        title: 'Verificação Concluída',
        description: `Status: ${data.status} - ${data.summary.healthy}/${data.summary.total} componentes saudáveis`,
      });

      // Recarregar dados
      await fetchData();
    } catch (error) {
      toast({
        title: 'Erro na Verificação',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsRunningCheck(false);
    }
  };

  const updateConfig = async (updates: Partial<HealthConfig>) => {
    if (!config) return;

    try {
      const { error } = await supabase
        .from('system_health_config')
        .update(updates)
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, ...updates });
      toast({ title: 'Configuração Atualizada' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a configuração.',
        variant: 'destructive',
      });
    }
  };

  const getOverallStatus = (): 'healthy' | 'warning' | 'critical' => {
    if (statuses.length === 0) return 'healthy';
    
    const criticalCount = statuses.filter(s => s.status === 'critical').length;
    const warningCount = statuses.filter(s => s.status === 'warning' || s.status === 'recovering').length;
    
    if (criticalCount > 0) return 'critical';
    if (warningCount > 0) return 'warning';
    return 'healthy';
  };

  const getStatusCounts = () => {
    return {
      healthy: statuses.filter(s => s.status === 'healthy').length,
      warning: statuses.filter(s => s.status === 'warning' || s.status === 'recovering').length,
      critical: statuses.filter(s => s.status === 'critical').length,
      total: statuses.length,
    };
  };

  return {
    config,
    statuses,
    logs,
    isLoading,
    isRunningCheck,
    toggleSystem,
    toggleAutoRepair,
    runManualCheck,
    updateConfig,
    refetch: fetchData,
    getOverallStatus,
    getStatusCounts,
  };
}
