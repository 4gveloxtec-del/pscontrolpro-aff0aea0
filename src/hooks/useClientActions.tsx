/**
 * useClientActions - Hook para Ações de Cliente
 * 
 * Extrai as mutations e handlers principais do Clients.tsx:
 * - deleteMutation / deleteAllMutation
 * - archiveMutation / restoreMutation
 * 
 * Etapa 2.9 do plano de refatoração
 * 
 * IMPORTANTE: Este hook NÃO altera nenhuma funcionalidade.
 * Apenas reorganiza o código para melhor manutenibilidade.
 * 
 * NOTA: As mutations create/update ficam em useClientMutations (já existente)
 * e useAtomicClientSave. Este hook foca nas ações de ciclo de vida.
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Client } from '@/types/clients';
import { useClientValidation } from '@/hooks/useClientValidation';

// ============= Tipos =============
interface UseClientActionsOptions {
  userId: string | undefined;
  isViewingArchived: boolean;
  debouncedSearch: string;
  allLoadedClients: Client[];
  setAllLoadedClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setTotalClientCount: React.Dispatch<React.SetStateAction<number>>;
  setDbPage: React.Dispatch<React.SetStateAction<number>>;
  setHasMoreClients: React.Dispatch<React.SetStateAction<boolean>>;
  // Callbacks opcionais para comportamento adicional
  onDeleteAllSuccess?: () => void;
  onArchiveExpiredSuccess?: () => void;
}

interface UseClientActionsReturn {
  // Delete mutations
  deleteMutation: ReturnType<typeof useMutation<string, Error, string, { previousClients: Client[] }>>;
  deleteAllMutation: ReturnType<typeof useMutation<void, Error, void, unknown>>;
  
  // Archive/restore mutations
  archiveMutation: ReturnType<typeof useMutation<string, Error, string, { previousClients: Client[] }>>;
  restoreMutation: ReturnType<typeof useMutation<string, Error, string, { previousClients: Client[] }>>;
  archiveCalledExpiredMutation: ReturnType<typeof useMutation<number, Error, string[], unknown>>;
  
  // Helper booleans
  isDeleting: boolean;
  isArchiving: boolean;
  isRestoring: boolean;
}

// ============= Hook Principal =============
export function useClientActions({
  userId,
  isViewingArchived,
  debouncedSearch,
  allLoadedClients,
  setAllLoadedClients,
  setTotalClientCount,
  setDbPage,
  setHasMoreClients,
  onDeleteAllSuccess,
  onArchiveExpiredSuccess,
}: UseClientActionsOptions): UseClientActionsReturn {
  const queryClient = useQueryClient();
  const { validateForDelete, acquireLock, releaseLock } = useClientValidation();

  // ============= Helper para invalidar caches =============
  const invalidateClientCaches = useCallback((options?: { defer?: boolean }) => {
    const criticalKeys = [
      ['clients'],
      ['clients-count'],
    ];
    
    const deferredKeys = [
      ['clients-all-for-search'],
      ['clients-with-external-apps'],
      ['archived-clients-count'],
      ['server-client-counts'],
    ];
    
    // Invalidar caches críticos imediatamente
    criticalKeys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
    
    // Invalidar caches secundários com delay (para UX mais rápida)
    if (options?.defer !== false) {
      setTimeout(() => {
        deferredKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }, 50);
    } else {
      deferredKeys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }
  }, [queryClient]);

  // ============= Delete Mutation =============
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Validação preventiva - garantir que não está bloqueado
      const validation = validateForDelete(id);
      if (validation.blocked) {
        throw new Error('Aguarde, operação em andamento');
      }
      
      // Adquirir lock
      if (!acquireLock(id)) {
        throw new Error('Aguarde, operação em andamento');
      }
      
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        return id;
      } finally {
        releaseLock(id);
      }
    },
    onMutate: async (id) => {
      // Remover otimisticamente do estado local
      const previousClients = allLoadedClients;
      setAllLoadedClients(prev => prev.filter(client => client.id !== id));
      return { previousClients };
    },
    onSuccess: () => {
      // Sincronizar contagem local imediatamente
      setTotalClientCount(prev => Math.max(0, prev - 1));
      
      // Invalidar caches críticos
      invalidateClientCaches();
      toast.success('Cliente excluído!');
      
      // Reset paginação após sucesso
      setTimeout(() => {
        setDbPage(0);
        setAllLoadedClients([]);
        setHasMoreClients(true);
      }, 50);
    },
    onError: (error: Error, _id, context) => {
      // Rollback em caso de erro
      if (context?.previousClients) {
        setAllLoadedClients(context.previousClients);
      }
      toast.error(error.message);
    },
  });

  // ============= Delete All Mutation =============
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Usuário não autenticado');
      const { error } = await supabase.from('clients').delete().eq('seller_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      setTotalClientCount(0);
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);
      
      // Invalidar TODOS os caches relacionados
      invalidateClientCaches({ defer: false });
      toast.success('Todos os clientes foram excluídos!');
      
      // Callback opcional para comportamento adicional (ex: fechar diálogo)
      onDeleteAllSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // ============= Archive Mutation =============
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      // Atualização otimista no estado local
      const previousClients = allLoadedClients;
      setAllLoadedClients(prev => {
        // Se o usuário está visualizando clientes ativos, remover da lista
        if (!isViewingArchived) {
          return prev.filter(client => client.id !== id);
        }
        // Caso contrário, atualizar o registro
        return prev.map(client =>
          client.id === id
            ? { ...client, is_archived: true, archived_at: new Date().toISOString() }
            : client
        );
      });
      return { previousClients };
    },
    onSuccess: () => {
      // Manter contador local sincronizado (apenas quando não há busca ativa)
      if (!debouncedSearch.trim()) {
        setTotalClientCount(prev => (isViewingArchived ? prev + 1 : Math.max(0, prev - 1)));
      }

      // Reset cache de paginação para evitar lista desatualizada
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);

      // Invalidar todos os caches relacionados
      invalidateClientCaches({ defer: false });
      toast.success('Cliente movido para lixeira!');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previousClients) {
        setAllLoadedClients(context.previousClients);
      }
      toast.error(error.message);
    },
  });

  // ============= Restore Mutation =============
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ is_archived: false, archived_at: null })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      // Atualização otimista no estado local
      const previousClients = allLoadedClients;
      setAllLoadedClients(prev => {
        // Se o usuário está visualizando arquivados, remover da lista
        if (isViewingArchived) {
          return prev.filter(client => client.id !== id);
        }
        // Caso contrário, atualizar o registro
        return prev.map(client =>
          client.id === id
            ? { ...client, is_archived: false, archived_at: null }
            : client
        );
      });
      return { previousClients };
    },
    onSuccess: () => {
      // Manter contador local sincronizado
      if (!debouncedSearch.trim()) {
        setTotalClientCount(prev => (isViewingArchived ? Math.max(0, prev - 1) : prev + 1));
      }

      // Reset cache de paginação
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);

      // Invalidar todos os caches
      invalidateClientCaches({ defer: false });
      toast.success('Cliente restaurado!');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previousClients) {
        setAllLoadedClients(context.previousClients);
      }
      toast.error(error.message);
    },
  });

  // ============= Archive Called Expired Mutation (bulk archive) =============
  const archiveCalledExpiredMutation = useMutation({
    mutationFn: async (clientIds: string[]) => {
      const { error } = await supabase
        .from('clients')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .in('id', clientIds);
      if (error) throw error;
      return clientIds.length;
    },
    onSuccess: (count) => {
      // Manter contador local sincronizado
      if (!debouncedSearch.trim()) {
        setTotalClientCount(prev => (isViewingArchived ? prev + count : Math.max(0, prev - count)));
      }

      // Reset cache de paginação
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);

      // Invalidar todos os caches relacionados
      invalidateClientCaches({ defer: false });
      toast.success(`${count} cliente${count > 1 ? 's' : ''} vencido${count > 1 ? 's' : ''} arquivado${count > 1 ? 's' : ''}!`);
      
      // Callback opcional
      onArchiveExpiredSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // ============= Return =============
  return {
    // Mutations
    deleteMutation,
    deleteAllMutation,
    archiveMutation,
    restoreMutation,
    archiveCalledExpiredMutation,
    
    // Helper states
    isDeleting: deleteMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

export default useClientActions;
