/**
 * Atomic Client Operations Hook
 * 
 * Provides transactional client create/update operations that ensure:
 * - All fields are saved together atomically
 * - Partial saves are prevented if connection drops
 * - Related data (apps, premium accounts, credentials) is handled atomically
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExternalApp {
  appId: string;
  email?: string;
  password?: string;
  expirationDate?: string;
  devices: Array<{ mac: string; model?: string }>;
}

interface PremiumAccount {
  planName?: string;
  email?: string;
  password?: string;
  price?: string;
  expirationDate?: string;
  notes?: string;
}

interface ServerAppConfig {
  serverId: string;
  apps: Array<{
    serverAppId: string;
    authCode?: string;
    username?: string;
    password?: string;
    provider?: string;
  }>;
}

interface AtomicClientPayload {
  // Client data
  clientData: Record<string, unknown>;
  clientId?: string; // For updates
  sellerId: string;
  
  // Related data
  externalApps?: ExternalApp[];
  premiumAccounts?: PremiumAccount[];
  serverAppsConfig?: ServerAppConfig[];
  
  // Panel entries for credit-based servers
  panelEntries?: Array<{
    panel_id: string;
    slot_type: string;
  }>;
  
  // Options
  sendWelcomeMessage?: boolean;
  customWelcomeMessage?: string | null;
}

interface AtomicResult {
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

/**
 * Performs atomic upsert via Edge Function with transaction support
 */
async function atomicClientOperation(payload: AtomicClientPayload): Promise<AtomicResult> {
  const { data, error } = await supabase.functions.invoke('atomic-client-upsert', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Falha na operação atômica');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Operação falhou');
  }

  return data as AtomicResult;
}

export function useAtomicClientCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: atomicClientOperation,
    onMutate: () => {
      toast.loading('Salvando cliente (atômico)...', { id: 'atomic-save' });
    },
    onSuccess: (result) => {
      toast.dismiss('atomic-save');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-count'] });
      queryClient.invalidateQueries({ queryKey: ['server-credit-clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-panel-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-external-apps'] });
      queryClient.invalidateQueries({ queryKey: ['client-premium-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['client-server-app-credentials'] });
      
      const details = result.details;
      if (details) {
        console.log('[AtomicClient] Saved:', details);
      }
      
      toast.success('Cliente salvo com sucesso (atômico)! ✅');
    },
    onError: (error: Error) => {
      toast.dismiss('atomic-save');
      toast.error(`Falha ao salvar: ${error.message}`);
    },
  });
}

export function useAtomicClientUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: atomicClientOperation,
    onMutate: () => {
      toast.loading('Atualizando cliente (atômico)...', { id: 'atomic-update' });
    },
    onSuccess: (result) => {
      toast.dismiss('atomic-update');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-count'] });
      queryClient.invalidateQueries({ queryKey: ['server-credit-clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-panel-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-external-apps'] });
      queryClient.invalidateQueries({ queryKey: ['client-premium-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['client-server-app-credentials'] });
      
      toast.success('Cliente atualizado com sucesso (atômico)! ✅');
    },
    onError: (error: Error) => {
      toast.dismiss('atomic-update');
      toast.error(`Falha ao atualizar: ${error.message}`);
    },
  });
}

export type { AtomicClientPayload, AtomicResult, ExternalApp, PremiumAccount, ServerAppConfig };
