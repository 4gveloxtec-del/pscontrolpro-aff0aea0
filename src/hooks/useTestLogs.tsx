import { useState, useCallback, useMemo } from 'react';
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
  servers?: { name: string } | null;
}

interface UseTestLogsOptions {
  limit?: number;
}

export function useTestLogs(options: UseTestLogsOptions = {}) {
  const { limit = 100 } = options;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());

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
        .select('id, sender_phone, username, client_created, client_id, created_at, error_message, test_name, server_id, servers:server_id(name)')
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as TestLog[];
    },
    enabled: !!user?.id,
  });

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

  // Estatísticas derivadas
  const stats = useMemo(() => ({
    total: logs.length,
    created: logs.filter(l => l.client_created).length,
    failed: logs.filter(l => !l.client_created).length,
    selectedCount: selectedLogs.size,
  }), [logs, selectedLogs]);

  return {
    // Data
    logs,
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
