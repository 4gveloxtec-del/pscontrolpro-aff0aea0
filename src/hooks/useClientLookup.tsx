/**
 * useClientLookup - Hook para Consulta 360° de Clientes
 * 
 * REFATORADO: Usa colunas normalizadas (*_search) para busca SQL.
 * NÃO faz mais descriptografia em massa para busca.
 * Descriptografia ocorre APENAS ao visualizar detalhes de 1 cliente.
 * 
 * Etapa 2.6 do plano de refatoração + Otimização de busca
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeWhatsAppNumber } from '@/lib/utils';
import { differenceInDays, startOfToday } from 'date-fns';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// ============= Tipos =============
interface LookupClientBasic {
  id: string;
  seller_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  login: string | null;
  login_2: string | null;
  expiration_date: string;
  plan_name: string | null;
  category: string | null;
  is_archived: boolean | null;
  created_at: string | null;
}

interface LookupDecryptedCreds {
  login: string;
  password: string;
  login_2?: string;
  password_2?: string;
}

interface LookupPhoneGroup {
  phone: string;
  normalizedPhone: string;
  clients: LookupClientBasic[];
}

interface UseClientLookupOptions {
  userId: string | undefined;
  isAdmin: boolean;
  decrypt: (value: string) => Promise<string>;
}

// ============= Helper: Heurística de criptografia =============
const looksEncrypted = (value: string): boolean => {
  if (!value || value.length < 20) return false;
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(value)) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  const hasUpperAndLower = /[A-Z]/.test(value) && /[a-z]/.test(value);
  const hasPadding = value.endsWith('=');
  const hasSpecialBase64 = /[+/]/.test(value);
  return hasUpperAndLower || hasPadding || hasSpecialBase64;
};

// ============= Hook Principal =============
export function useClientLookup({ userId, isAdmin, decrypt }: UseClientLookupOptions) {
  // ============= Estados do Modal =============
  const [showLookupDialog, setShowLookupDialog] = useState(false);
  const [lookupSearchQuery, setLookupSearchQuery] = useState('');
  const [selectedLookupClientId, setSelectedLookupClientId] = useState<string | null>(null);
  const [selectedLookupPhone, setSelectedLookupPhone] = useState<string | null>(null);
  const [showLookupPasswords, setShowLookupPasswords] = useState(false);
  const [lookupDecryptedCredentials, setLookupDecryptedCredentials] = useState<LookupDecryptedCreds | null>(null);
  const [lookupDecryptAttempt, setLookupDecryptAttempt] = useState(0);
  const lookupRetryTimeoutRef = useRef<number | null>(null);
  const [lookupPhoneDecryptedCreds, setLookupPhoneDecryptedCreds] = useState<Record<string, LookupDecryptedCreds>>({});

  // Debounce para evitar request a cada tecla
  const debouncedLookupSearchQuery = useDebouncedValue(lookupSearchQuery, 300);

  // ============= Query: Busca SQL otimizada usando colunas *_search =============
  // ELIMINADA: descriptografia em massa. A busca agora usa colunas normalizadas.
  const { data: searchResults = [], isLoading: isLoadingSearch, isPlaceholderData } = useQuery({
    queryKey: ['client-lookup-search-v2', userId, debouncedLookupSearchQuery, isAdmin],
    queryFn: async () => {
      if (!userId || !debouncedLookupSearchQuery || debouncedLookupSearchQuery.length < 2) return [];

      // Usar função RPC V2 que busca nas colunas *_search (normalizadas)
      const { data, error } = await supabase.rpc('search_clients_360_v2', {
        p_seller_id: userId,
        p_search_term: debouncedLookupSearchQuery.trim(),
        p_limit: 50
      });

      if (error) {
        console.error('[useClientLookup] Search error:', error);
        // Fallback para busca simples se a função V2 não existir
        if (error.message?.includes('function') || error.message?.includes('does not exist')) {
          console.warn('[useClientLookup] Falling back to simple search');
          const { data: fallbackData } = await supabase
            .from('clients')
            .select('id, seller_id, name, phone, email, login, login_2, expiration_date, plan_name, category, is_archived, created_at')
            .eq('seller_id', userId)
            .eq('is_archived', false)
            .or(`name.ilike.%${debouncedLookupSearchQuery}%,email.ilike.%${debouncedLookupSearchQuery}%,phone.ilike.%${debouncedLookupSearchQuery}%,plan_name.ilike.%${debouncedLookupSearchQuery}%`)
            .order('expiration_date', { ascending: false })
            .limit(50);
          return (fallbackData || []) as LookupClientBasic[];
        }
        return [];
      }

      return (data || []) as LookupClientBasic[];
    },
    enabled: !!userId && showLookupDialog && !!debouncedLookupSearchQuery && debouncedLookupSearchQuery.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // ============= Resultados de busca (direto do servidor, sem descriptografia) =============
  const lookupSearchResultsRaw = useMemo(() => {
    if (!lookupSearchQuery || lookupSearchQuery.length < 2) return [];
    
    // Aguarda debounce para evitar flicker
    const normalizedNow = lookupSearchQuery.trim().toLowerCase();
    const normalizedDebounced = (debouncedLookupSearchQuery ?? '').trim().toLowerCase();
    const isQuerySettled = normalizedNow === normalizedDebounced;
    
    if (!isQuerySettled || isPlaceholderData) {
      // Enquanto digita, mostra resultados anteriores (placeholder)
      return searchResults;
    }
    
    return searchResults;
  }, [lookupSearchQuery, debouncedLookupSearchQuery, searchResults, isPlaceholderData]);

  const isLookupSearching = isLoadingSearch;

  // ============= Agrupar resultados por telefone =============
  const lookupGroupedResults = useMemo((): LookupPhoneGroup[] => {
    const groups = new Map<string, LookupPhoneGroup>();

    lookupSearchResultsRaw.forEach((client) => {
      const normalized = normalizeWhatsAppNumber(client.phone);
      const key = normalized || `no-phone-${client.id}`;

      if (!groups.has(key)) {
        groups.set(key, {
          phone: client.phone || '',
          normalizedPhone: normalized || '',
          clients: [],
        });
      }
      groups.get(key)!.clients.push(client);
    });

    // Sort clients within each group by expiration_date descending
    groups.forEach((group) => {
      group.clients.sort((a, b) =>
        new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime()
      );
    });

    return Array.from(groups.values());
  }, [lookupSearchResultsRaw]);

  // ============= Query: Clientes por telefone selecionado =============
  const { data: lookupPhoneClients = [], isLoading: isLoadingLookupPhoneClients } = useQuery({
    queryKey: ['client-lookup-by-phone', selectedLookupPhone, userId],
    queryFn: async () => {
      if (!userId || !selectedLookupPhone) return [];

      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          plan:plans(name, price, duration_days, category),
          server:servers(name, icon_url)
        `)
        .eq('seller_id', userId)
        .order('expiration_date', { ascending: false });

      if (error) throw error;

      // Filter by normalized phone on client side
      const filtered = (data || []).filter((client) => {
        const normalized = normalizeWhatsAppNumber(client.phone);
        return normalized === selectedLookupPhone;
      });

      return filtered.map((client) => ({
        ...client,
        external_apps: [],
        premium_accounts: [],
        message_history: [],
        device_apps: [],
        server_app_credentials: [],
        _secondaryDataLoaded: false,
      }));
    },
    enabled: !!userId && !!selectedLookupPhone && showLookupDialog,
    staleTime: 30000,
  });

  // ============= Estado para dados secundários carregados sob demanda =============
  const [expandedClientSecondaryData, setExpandedClientSecondaryData] = useState<Record<string, {
    external_apps: any[];
    premium_accounts: any[];
    message_history: any[];
    device_apps: any[];
    server_app_credentials: any[];
  }>>({});
  const [loadingSecondaryData, setLoadingSecondaryData] = useState<string | null>(null);

  // ============= Função para carregar dados secundários sob demanda =============
  const loadSecondaryDataForClient = useCallback(async (clientId: string) => {
    if (!userId || expandedClientSecondaryData[clientId]) return;
    
    setLoadingSecondaryData(clientId);
    
    try {
      const [externalAppsResult, premiumAccountsResult, messageHistoryResult, deviceAppsResult, serverAppsCredsResult] = await Promise.all([
        supabase
          .from('client_external_apps')
          .select('id, email, password, expiration_date, devices, notes, fixed_app_name, external_app:external_apps(name, download_url)')
          .eq('client_id', clientId)
          .eq('seller_id', userId),
        supabase
          .from('client_premium_accounts')
          .select('id, plan_name, email, password, expiration_date, price, notes')
          .eq('client_id', clientId)
          .eq('seller_id', userId),
        supabase
          .from('message_history')
          .select('id, message_type, message_content, sent_at')
          .eq('client_id', clientId)
          .eq('seller_id', userId)
          .order('sent_at', { ascending: false })
          .limit(5),
        supabase
          .from('client_device_apps')
          .select('id, app:reseller_device_apps(name, icon, download_url)')
          .eq('client_id', clientId)
          .eq('seller_id', userId),
        supabase
          .from('client_server_app_credentials')
          .select('id, auth_code, username, password, provider, notes, server_app:server_apps(name, auth_type)')
          .eq('client_id', clientId)
          .eq('seller_id', userId),
      ]);

      setExpandedClientSecondaryData(prev => ({
        ...prev,
        [clientId]: {
          external_apps: externalAppsResult.data || [],
          premium_accounts: premiumAccountsResult.data || [],
          message_history: messageHistoryResult.data || [],
          device_apps: deviceAppsResult.data || [],
          server_app_credentials: serverAppsCredsResult.data || [],
        }
      }));
    } catch (error) {
      console.error('[useClientLookup] Error loading secondary data:', error);
    } finally {
      setLoadingSecondaryData(null);
    }
  }, [userId, expandedClientSecondaryData]);

  // ============= Getter para dados do cliente com secundários =============
  const getClientWithSecondaryData = useCallback((client: any) => {
    const secondary = expandedClientSecondaryData[client.id];
    if (!secondary) return client;
    
    return {
      ...client,
      external_apps: secondary.external_apps,
      premium_accounts: secondary.premium_accounts,
      message_history: secondary.message_history,
      device_apps: secondary.device_apps,
      server_app_credentials: secondary.server_app_credentials,
      _secondaryDataLoaded: true,
    };
  }, [expandedClientSecondaryData]);

  // ============= Query: Cliente individual (com dados completos) =============
  const { data: lookupClientData, isLoading: isLoadingLookupClient } = useQuery({
    queryKey: ['client-full-data', selectedLookupClientId, userId],
    queryFn: async () => {
      if (!userId || !selectedLookupClientId) return null;

      let clientQuery = supabase
        .from('clients')
        .select(`
          *,
          plan:plans(name, price, duration_days, category),
          server:servers(name, icon_url)
        `)
        .eq('id', selectedLookupClientId);

      if (!isAdmin) {
        clientQuery = clientQuery.eq('seller_id', userId);
      }

      const { data: client, error: clientError } = await clientQuery.maybeSingle();
      if (clientError) throw clientError;
      if (!client) throw new Error('Cliente não encontrado');

      let externalAppsQuery = supabase
        .from('client_external_apps')
        .select('id, email, password, expiration_date, devices, notes, fixed_app_name, external_app:external_apps(name, download_url)')
        .eq('client_id', selectedLookupClientId);

      let premiumAccountsQuery = supabase
        .from('client_premium_accounts')
        .select('id, plan_name, email, password, expiration_date, price, notes')
        .eq('client_id', selectedLookupClientId);

      let deviceAppsQuery = supabase
        .from('client_device_apps')
        .select('id, app:reseller_device_apps(name, icon, download_url)')
        .eq('client_id', selectedLookupClientId);

      let messageHistoryQuery = supabase
        .from('message_history')
        .select('id, message_type, message_content, sent_at')
        .eq('client_id', selectedLookupClientId)
        .order('sent_at', { ascending: false })
        .limit(10);

      let panelClientsQuery = supabase
        .from('panel_clients')
        .select('id, slot_type, server:servers(name)')
        .eq('client_id', selectedLookupClientId);

      if (!isAdmin) {
        externalAppsQuery = externalAppsQuery.eq('seller_id', userId);
        premiumAccountsQuery = premiumAccountsQuery.eq('seller_id', userId);
        deviceAppsQuery = deviceAppsQuery.eq('seller_id', userId);
        messageHistoryQuery = messageHistoryQuery.eq('seller_id', userId);
        panelClientsQuery = panelClientsQuery.eq('seller_id', userId);
      }

      const [externalAppsResult, premiumAccountsResult, deviceAppsResult, messageHistoryResult, panelClientsResult] = await Promise.all([
        externalAppsQuery,
        premiumAccountsQuery,
        deviceAppsQuery,
        messageHistoryQuery,
        panelClientsQuery,
      ]);

      return {
        ...client,
        external_apps: externalAppsResult.data || [],
        premium_accounts: premiumAccountsResult.data || [],
        device_apps: deviceAppsResult.data || [],
        message_history: messageHistoryResult.data || [],
        panel_clients: panelClientsResult.data || [],
      };
    },
    enabled: !!userId && !!selectedLookupClientId && showLookupDialog,
    staleTime: 30000,
  });

  // ============= Descriptografia automática do cliente selecionado (APENAS 1 cliente) =============
  useEffect(() => {
    if (!showLookupDialog || !lookupClientData) return;

    // Clear pending retry
    if (lookupRetryTimeoutRef.current) {
      window.clearTimeout(lookupRetryTimeoutRef.current);
      lookupRetryTimeoutRef.current = null;
    }

    const run = async () => {
      const maybeDecrypt = async (value: string | null): Promise<string> => {
        if (!value) return '';
        if (!looksEncrypted(value)) return value;
        try {
          return await decrypt(value);
        } catch {
          return value;
        }
      };

      const clientData = lookupClientData as any;
      const [login, password, login_2, password_2] = await Promise.all([
        maybeDecrypt(clientData?.login ?? null),
        maybeDecrypt(clientData?.password ?? null),
        maybeDecrypt(clientData?.login_2 ?? null),
        maybeDecrypt(clientData?.password_2 ?? null),
      ]);

      const unresolved = [
        { original: clientData?.login ?? null, result: login },
        { original: clientData?.password ?? null, result: password },
        { original: clientData?.login_2 ?? null, result: login_2 },
        { original: clientData?.password_2 ?? null, result: password_2 },
      ].some(({ original, result }) => {
        if (!original) return false;
        return looksEncrypted(original) && looksEncrypted(result);
      });

      if (unresolved && lookupDecryptAttempt < 3) {
        setLookupDecryptedCredentials(null);
        const delayMs = 600 * Math.pow(2, lookupDecryptAttempt);
        lookupRetryTimeoutRef.current = window.setTimeout(() => {
          setLookupDecryptAttempt((a) => a + 1);
        }, delayMs);
        return;
      }

      setLookupDecryptedCredentials({ login, password, login_2, password_2 });
    };

    run();

    return () => {
      if (lookupRetryTimeoutRef.current) {
        window.clearTimeout(lookupRetryTimeoutRef.current);
        lookupRetryTimeoutRef.current = null;
      }
    };
  }, [showLookupDialog, lookupClientData, decrypt, lookupDecryptAttempt]);

  // ============= Descriptografia para visão por telefone (APENAS clientes expandidos) =============
  useEffect(() => {
    if (!showLookupDialog || !selectedLookupPhone || lookupPhoneClients.length === 0) {
      return;
    }

    const maybeDecrypt = async (value: string | null): Promise<string> => {
      if (!value) return '';
      if (!looksEncrypted(value)) return value;
      try {
        return await decrypt(value);
      } catch {
        return value;
      }
    };

    const decryptAllClientsInPhone = async () => {
      const results: Record<string, LookupDecryptedCreds> = {};

      await Promise.all(
        lookupPhoneClients.map(async (client: any) => {
          // Skip if already decrypted
          if (lookupPhoneDecryptedCreds[client.id]) {
            results[client.id] = lookupPhoneDecryptedCreds[client.id];
            return;
          }

          const [login, password, login_2, password_2] = await Promise.all([
            maybeDecrypt(client.login ?? null),
            maybeDecrypt(client.password ?? null),
            maybeDecrypt(client.login_2 ?? null),
            maybeDecrypt(client.password_2 ?? null),
          ]);

          results[client.id] = { login, password, login_2, password_2 };
        })
      );

      setLookupPhoneDecryptedCreds((prev) => ({ ...prev, ...results }));
    };

    decryptAllClientsInPhone();
  }, [showLookupDialog, selectedLookupPhone, lookupPhoneClients, decrypt, lookupPhoneDecryptedCreds]);

  // ============= Helpers =============
  const getLookupStatusBadge = useCallback((expirationDate: string) => {
    const daysLeft = differenceInDays(new Date(expirationDate), startOfToday());
    if (daysLeft < 0) return { text: 'Vencido', class: 'bg-destructive text-destructive-foreground' };
    if (daysLeft <= 3) return { text: `${daysLeft}d`, class: 'bg-warning text-warning-foreground' };
    return { text: `${daysLeft}d`, class: 'bg-success text-success-foreground' };
  }, []);

  // ============= Ações do Modal =============
  const openLookupDialog = useCallback(() => {
    setShowLookupDialog(true);
    setLookupSearchQuery('');
    setSelectedLookupClientId(null);
    setSelectedLookupPhone(null);
    setShowLookupPasswords(false);
    setLookupDecryptedCredentials(null);
    setLookupDecryptAttempt(0);
  }, []);

  const closeLookupDialog = useCallback(() => {
    setShowLookupDialog(false);
    setLookupSearchQuery('');
    setSelectedLookupClientId(null);
    setSelectedLookupPhone(null);
    setShowLookupPasswords(false);
    setLookupDecryptedCredentials(null);
    setLookupDecryptAttempt(0);
    setExpandedClientSecondaryData({});
    setLookupPhoneDecryptedCreds({});
  }, []);

  const selectPhone = useCallback((phone: string) => {
    setSelectedLookupPhone(phone);
    setSelectedLookupClientId(null);
  }, []);

  const selectClient = useCallback((clientId: string) => {
    setSelectedLookupClientId(clientId);
    setSelectedLookupPhone(null);
    setLookupDecryptedCredentials(null);
    setLookupDecryptAttempt(0);
  }, []);

  const goBackToSearch = useCallback(() => {
    setSelectedLookupClientId(null);
    setSelectedLookupPhone(null);
    setLookupDecryptedCredentials(null);
  }, []);

  // ============= Return =============
  return {
    // Estados do modal
    showLookupDialog,
    setShowLookupDialog,
    lookupSearchQuery,
    setLookupSearchQuery,
    selectedLookupClientId,
    selectedLookupPhone,
    showLookupPasswords,
    setShowLookupPasswords,
    lookupDecryptedCredentials,
    lookupPhoneDecryptedCreds,

    // Dados
    lookupSearchResultsRaw,
    lookupGroupedResults,
    lookupPhoneClients,
    lookupClientData,

    // Loading states
    isLoadingLookupPhoneClients,
    isLoadingLookupClient,
    isLookupSearching,
    loadingSecondaryData,

    // Helpers
    getLookupStatusBadge,
    getClientWithSecondaryData,

    // Ações
    openLookupDialog,
    closeLookupDialog,
    selectPhone,
    selectClient,
    goBackToSearch,
    loadSecondaryDataForClient,
  };
}

// Export do tipo para uso no componente principal
export type { LookupClientBasic, LookupDecryptedCreds, LookupPhoneGroup };
