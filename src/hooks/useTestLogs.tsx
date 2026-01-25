import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface TestLog {
  id: string;
  sender_phone: string;
  username: string | null;
  client_created: boolean;
  client_id: string | null;
  created_at: string;
  error_message: string | null;
  test_name: string | null;
  server_id: string | null;
  expiration_date: string | null;
  expiration_datetime: string | null;
  notified_20min: boolean | null;
  servers?: { name: string } | null;
}

interface UseTestLogsOptions {
  limit?: number;
  autoRefreshInterval?: number; // em ms, default 30s
}

/**
 * Calcula tempo restante até expiração
 * Retorna formato legível: "12h 45m", "30m", "VENCIDO"
 */
export function calcularTempoRestante(expirationDatetime: string | null | undefined): {
  texto: string;
  status: 'ok' | 'warning' | 'critical' | 'expired';
  minutosRestantes: number;
} {
  if (!expirationDatetime) {
    return { texto: '--', status: 'ok', minutosRestantes: 0 };
  }

  const agora = new Date();
  const expire = new Date(expirationDatetime);
  const diffMs = expire.getTime() - agora.getTime();

  if (diffMs < 0) {
    return { texto: 'VENCIDO', status: 'expired', minutosRestantes: 0 };
  }

  const minutosTotal = Math.floor(diffMs / (1000 * 60));
  const horas = Math.floor(minutosTotal / 60);
  const minutos = minutosTotal % 60;

  let texto: string;
  if (horas > 0) {
    texto = `${horas}h ${minutos}m`;
  } else {
    texto = `${minutos}m`;
  }

  // Determinar status visual
  let status: 'ok' | 'warning' | 'critical' | 'expired';
  if (minutosTotal <= 20) {
    status = 'critical';
  } else if (minutosTotal <= 60) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return { texto, status, minutosRestantes: minutosTotal };
}

export function useTestLogs(options: UseTestLogsOptions = {}) {
  const { limit = 100, autoRefreshInterval = 30000 } = options;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0); // Para forçar re-render do countdown

  // Query para buscar logs
  const { 
    data: logs = [], 
    isLoading, 
    refetch 
  } = useQuery({
    queryKey: ['test-generation-logs', user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_generation_log')
        .select('id, sender_phone, username, client_created, client_id, created_at, error_message, test_name, server_id, expiration_date, expiration_datetime, notified_20min, servers:server_id(name)')
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as TestLog[];
    },
    enabled: !!user?.id,
    refetchInterval: autoRefreshInterval, // Auto-refresh a cada 30s
    staleTime: 10000, // Considera stale após 10s
  });

  // Timer para atualizar countdown a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Mutation para deletar logs
  const deleteLogsMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      // Buscar client_ids associados
      const { data: logsToDelete } = await supabase
        .from('test_generation_log')
        .select('id, client_id')
        .in('id', logIds);

      // Deletar clientes associados
      const clientIds = logsToDelete
        ?.filter(l => l.client_id)
        .map(l => l.client_id) as string[];
      
      if (clientIds.length > 0) {
        const { error: clientError } = await supabase
          .from('clients')
          .delete()
          .in('id', clientIds);
        
        if (clientError) {
          console.error('Error deleting clients:', clientError);
        }
      }

      // Deletar os logs
      const { error } = await supabase
        .from('test_generation_log')
        .delete()
        .in('id', logIds);
      
      if (error) throw error;
      
      return { deletedLogs: logIds.length, deletedClients: clientIds.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['test-generation-logs'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedLogs(new Set());
      toast.success(`${result.deletedLogs} teste(s) removido(s) com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover testes: ' + error.message);
    },
  });

  // Handlers de seleção
  const handleSelectLog = useCallback((logId: string, checked: boolean) => {
    setSelectedLogs(prev => {
      const newSelected = new Set(prev);
      if (checked) {
        newSelected.add(logId);
      } else {
        newSelected.delete(logId);
      }
      return newSelected;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedLogs(new Set(logs.map(l => l.id)));
    } else {
      setSelectedLogs(new Set());
    }
  }, [logs]);

  const clearSelection = useCallback(() => {
    setSelectedLogs(new Set());
  }, []);

  // Logs com tempo restante calculado
  const logsComTempo = useMemo(() => {
    return logs.map(log => ({
      ...log,
      tempoRestante: calcularTempoRestante(log.expiration_datetime || log.expiration_date),
    }));
  }, [logs]);

  // Estatísticas derivadas
  const stats = useMemo(() => {
    const ativos = logsComTempo.filter(l => l.client_created && l.tempoRestante.status !== 'expired');
    const criticos = logsComTempo.filter(l => l.tempoRestante.status === 'critical');
    const vencidos = logsComTempo.filter(l => l.tempoRestante.status === 'expired');
    
    return {
      total: logs.length,
      created: logs.filter(l => l.client_created).length,
      failed: logs.filter(l => !l.client_created).length,
      selectedCount: selectedLogs.size,
      ativos: ativos.length,
      criticos: criticos.length,
      vencidos: vencidos.length,
    };
  }, [logs, logsComTempo, selectedLogs]);

  return {
    // Data
    logs: logsComTempo,
    selectedLogs,
    stats,
    
    // Loading states
    isLoading,
    isDeleting: deleteLogsMutation.isPending,
    
    // Actions
    refetch,
    deleteLogs: deleteLogsMutation.mutate,
    handleSelectLog,
    handleSelectAll,
    clearSelection,
  };
}
