/**
 * Optimized Client Mutations Hook
 * 
 * Uses atomic-client-upsert edge function for fast, transactional saves.
 * Implements optimistic updates and smart cache invalidation.
 * 
 * IMPORTANT: This hook expects data to be ALREADY ENCRYPTED by the caller.
 * The Edge Function handles the atomic transaction, not the encryption.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCallback } from 'react';

interface ExternalAppData {
  appId: string;
  email?: string;
  password?: string; // Already encrypted by caller
  expirationDate?: string;
  devices: Array<{ mac: string; model?: string }>;
}

interface PremiumAccountData {
  planName?: string;
  email?: string;
  password?: string;
  price?: string;
  expirationDate?: string;
  notes?: string;
}

interface ServerAppCredential {
  serverAppId: string;
  authCode?: string;
  username?: string;
  password?: string; // Already encrypted by caller
  provider?: string;
}

interface ServerAppsConfigData {
  serverId: string;
  apps: ServerAppCredential[];
}

interface PanelEntryData {
  panel_id: string;
  slot_type: 'iptv' | 'p2p';
}

export interface ClientSavePayload {
  clientData: Record<string, unknown>;
  clientId?: string;
  sellerId: string;
  externalApps?: ExternalAppData[];
  premiumAccounts?: PremiumAccountData[];
  serverAppsConfig?: ServerAppsConfigData[];
  panelEntries?: PanelEntryData[];
  sendWelcomeMessage?: boolean;
  customWelcomeMessage?: string | null;
}

interface SaveResult {
  success: boolean;
  clientId?: string;
  error?: string;
  rolledBack?: boolean;
  details?: {
    clientSaved: boolean;
    externalAppsSaved: number;
    premiumAccountsSaved: number;
    serverAppCredentialsSaved: number;
    panelEntriesSaved: number;
  };
}

// Debounce map to prevent double-submissions - use WeakMap alternative with Set for cleanup
const pendingOperations = new Set<string>();

// Timeout for stale locks (prevent permanent blocks)
const LOCK_TIMEOUT_MS = 30000;
const lockTimestamps = new Map<string, number>();

function acquireLock(key: string): boolean {
  const now = Date.now();
  
  // Clean up stale locks
  if (pendingOperations.has(key)) {
    const timestamp = lockTimestamps.get(key) || 0;
    if (now - timestamp > LOCK_TIMEOUT_MS) {
      console.warn(`[useClientMutations] Stale lock detected for ${key}, releasing`);
      pendingOperations.delete(key);
      lockTimestamps.delete(key);
    } else {
      return false;
    }
  }
  
  pendingOperations.add(key);
  lockTimestamps.set(key, now);
  return true;
}

function releaseLock(key: string): void {
  pendingOperations.delete(key);
  lockTimestamps.delete(key);
}

export interface UseClientMutationsOptions {
  onSuccess?: (result: SaveResult, isUpdate: boolean) => void;
  onError?: (error: Error) => void;
  onCreateSuccess?: (result: SaveResult) => void;
  onUpdateSuccess?: (result: SaveResult) => void;
}

export function useClientMutations(options?: UseClientMutationsOptions) {
  const queryClient = useQueryClient();

  // Atomic save via Edge Function
  const atomicSave = useCallback(async (payload: ClientSavePayload): Promise<SaveResult> => {
    const operationKey = payload.clientId || `new-${Date.now()}`;
    
    // Prevent double-click / rapid submissions
    if (!acquireLock(operationKey)) {
      throw new Error('Operação em andamento, aguarde...');
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('atomic-client-upsert', {
        body: payload,
      });

      if (error) {
        // Parse edge function error message
        const errorMsg = error.message || 'Falha na operação';
        throw new Error(errorMsg);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Operação falhou sem mensagem de erro');
      }

      return data as SaveResult;
    } finally {
      releaseLock(operationKey);
    }
  }, []);

  // Smart cache invalidation - only invalidate what's needed
  const invalidateClientCaches = useCallback((isNew: boolean, resetPagination?: () => void) => {
    // Critical invalidations (always needed)
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['clients-count'] });
    
    // Reset pagination if provided (for new clients)
    if (isNew && resetPagination) {
      resetPagination();
    }
    
    // Only invalidate these for new clients
    if (isNew) {
      queryClient.invalidateQueries({ queryKey: ['server-credit-clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-panel-clients'] });
    }
    
    // Defer less critical invalidations
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['clients-all-for-search'] });
      queryClient.invalidateQueries({ queryKey: ['clients-with-external-apps'] });
      queryClient.invalidateQueries({ queryKey: ['server-client-counts'] });
      queryClient.invalidateQueries({ queryKey: ['client-external-apps'] });
      queryClient.invalidateQueries({ queryKey: ['client-premium-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['client-server-app-credentials'] });
    }, 100);
  }, [queryClient]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: atomicSave,
    onMutate: () => {
      toast.loading('Salvando cliente...', { id: 'client-save' });
    },
    onSuccess: (result) => {
      toast.dismiss('client-save');
      toast.success('Cliente salvo com sucesso! ✅');
      invalidateClientCaches(true);
      options?.onSuccess?.(result, false);
      options?.onCreateSuccess?.(result);
    },
    onError: (error: Error) => {
      toast.dismiss('client-save');
      toast.error(`Falha ao salvar: ${error.message}`);
      options?.onError?.(error);
    },
  });

  // Update mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: atomicSave,
    onMutate: async () => {
      toast.loading('Salvando alterações...', { id: 'client-update' });
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['clients'] });
      
      // Snapshot previous value
      const previousClients = queryClient.getQueryData(['clients']);
      
      return { previousClients };
    },
    onSuccess: (result) => {
      toast.dismiss('client-update');
      toast.success('Cliente atualizado! ✅');
      invalidateClientCaches(false);
      options?.onSuccess?.(result, true);
      options?.onUpdateSuccess?.(result);
    },
    onError: (error: Error, _variables, context) => {
      toast.dismiss('client-update');
      toast.error(`Falha ao atualizar: ${error.message}`);
      
      // Rollback on error
      if (context?.previousClients) {
        queryClient.setQueryData(['clients'], context.previousClients);
      }
      
      options?.onError?.(error);
    },
  });

  // Delete mutation - direct DB call (not through edge function)
  const deleteMutation = useMutation({
    mutationFn: async (clientId: string) => {
      if (!acquireLock(`delete-${clientId}`)) {
        throw new Error('Operação em andamento');
      }
      try {
        const { error } = await supabase.from('clients').delete().eq('id', clientId);
        if (error) throw error;
        return clientId;
      } finally {
        releaseLock(`delete-${clientId}`);
      }
    },
    onMutate: async () => {
      toast.loading('Excluindo...', { id: 'client-delete' });
      await queryClient.cancelQueries({ queryKey: ['clients'] });
    },
    onSuccess: () => {
      toast.dismiss('client-delete');
      toast.success('Cliente excluído!');
      invalidateClientCaches(false);
      queryClient.invalidateQueries({ queryKey: ['archived-clients-count'] });
    },
    onError: (error: Error) => {
      toast.dismiss('client-delete');
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq('id', clientId);
      if (error) throw error;
      return clientId;
    },
    onSuccess: () => {
      toast.success('Cliente arquivado!');
      invalidateClientCaches(false);
      queryClient.invalidateQueries({ queryKey: ['archived-clients-count'] });
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ is_archived: false, archived_at: null })
        .eq('id', clientId);
      if (error) throw error;
      return clientId;
    },
    onSuccess: () => {
      toast.success('Cliente restaurado!');
      invalidateClientCaches(false);
      queryClient.invalidateQueries({ queryKey: ['archived-clients-count'] });
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  return {
    // Main operations
    createClient: createMutation.mutateAsync,
    updateClient: updateMutation.mutateAsync,
    deleteClient: deleteMutation.mutateAsync,
    archiveClient: archiveMutation.mutateAsync,
    restoreClient: restoreMutation.mutateAsync,
    
    // Non-async versions for direct use
    createClientMutate: createMutation.mutate,
    updateClientMutate: updateMutation.mutate,
    
    // Status flags
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isSaving: createMutation.isPending || updateMutation.isPending,
    
    // Cache control
    invalidateClientCaches,
  };
}

export type { ExternalAppData, PremiumAccountData, ServerAppsConfigData, SaveResult };
