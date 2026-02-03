/**
 * useClientQueries - Hook para Gerenciamento de Queries de Clientes
 * 
 * Extrai as queries principais do Clients.tsx:
 * - Query de contagem de clientes
 * - Query paginada de clientes
 * - Query de busca por login descriptografado
 * - Queries auxiliares (arquivados, external apps, etc.)
 * 
 * Etapa 2.8 do plano de refatoração
 * 
 * IMPORTANTE: Este hook NÃO altera nenhuma funcionalidade.
 * Apenas reorganiza o código para melhor manutenibilidade.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Client,
  MacDevice,
  AdditionalServer,
  CLIENTS_PER_PAGE,
  SEARCH_PAGE_SIZE,
  AUTOLOAD_ALL_UP_TO,
} from '@/types/clients';

// ============= Tipos =============
interface UseClientQueriesOptions {
  userId: string | undefined;
  debouncedSearch: string;
  isViewingArchived: boolean;
}

interface UseClientQueriesReturn {
  // Dados principais
  clients: Client[];
  allLoadedClients: Client[];
  totalClientCount: number;
  archivedClientsCount: number;
  
  // Estados de loading
  isLoading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  
  // Paginação
  dbPage: number;
  hasMoreClients: boolean;
  loadMoreClients: () => void;
  goToPage: (page: number, loadAll?: boolean) => void;
  currentPage: number;
  
  // Dados para busca por login
  allClientsForSearch: { id: string; login: string | null; login_2: string | null }[];
  loginMatchingClientIds: Set<string>;
  setLoginMatchingClientIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  
  // External apps
  clientsWithExternalApps: string[];
  clientsWithPaidAppsSet: Set<string>;
  
  // Reset
  resetPagination: () => void;
  setAllLoadedClients: React.Dispatch<React.SetStateAction<Client[]>>;
}

// ============= Helper para hidratar clientes =============
const hydrateClients = (data: any[]): Client[] => {
  return (data || []).map(client => ({
    ...client,
    gerencia_app_devices: (client.gerencia_app_devices as unknown as MacDevice[]) || [],
    additional_servers: (client.additional_servers as unknown as AdditionalServer[]) || []
  })) as Client[];
};

// ============= Helper para construir filtro de busca =============
const buildSearchFilter = (raw: string): string[] => {
  const safe = raw.replace(/,/g, ' ');
  const like = `%${safe}%`;
  const digits = safe.replace(/\D/g, '');
  
  const orParts = [
    `name.ilike.${like}`,
    `dns.ilike.${like}`,
    `email.ilike.${like}`,
    `telegram.ilike.${like}`,
    `app_name.ilike.${like}`,
    `login.ilike.${like}`,
    `login_2.ilike.${like}`,
    `plan_name.ilike.${like}`,
    `category.ilike.${like}`,
    `notes.ilike.${like}`,
  ];
  
  // Phone search with variants
  if (digits.length >= 4) {
    orParts.push(`phone.ilike.%${digits}%`);
    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
      orParts.push(`phone.ilike.%55${digits}%`);
    }
    if (digits.startsWith('55') && digits.length >= 12) {
      const withoutPrefix = digits.substring(2);
      orParts.push(`phone.ilike.%${withoutPrefix}%`);
    }
  }
  
  return orParts;
};

// ============= Hook Principal =============
export function useClientQueries({
  userId,
  debouncedSearch,
  isViewingArchived,
}: UseClientQueriesOptions): UseClientQueriesReturn {
  // ============= Estados de Paginação =============
  const [dbPage, setDbPage] = useState(0);
  const [allLoadedClients, setAllLoadedClients] = useState<Client[]>([]);
  const [hasMoreClients, setHasMoreClients] = useState(true);
  const [totalClientCount, setTotalClientCount] = useState(0);
  
  // Estado para IDs de clientes que batem pelo login descriptografado
  const [loginMatchingClientIds, setLoginMatchingClientIds] = useState<Set<string>>(new Set());

  // ============= Query: Contagem de Clientes =============
  const { data: clientCount } = useQuery({
    queryKey: ['clients-count', userId, debouncedSearch, isViewingArchived],
    queryFn: async () => {
      if (!userId) return 0;

      try {
        let query = supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', userId);

        if (isViewingArchived) {
          query = query.eq('is_archived', true);
        } else {
          query = query.or('is_archived.is.null,is_archived.eq.false');
        }

        const raw = debouncedSearch.trim();
        if (raw) {
          const orParts = buildSearchFilter(raw);
          query = query.or(orParts.join(','));
        }

        const { count, error } = await query;
        if (error) {
          console.error('[useClientQueries] clientCount error:', error.message);
          return 0;
        }
        return count || 0;
      } catch (err) {
        console.error('[useClientQueries] clientCount exception:', err);
        return 0;
      }
    },
    enabled: !!userId,
    staleTime: 0,
  });

  // ============= Query: Clientes Paginados =============
  const { data: fetchedClients = [], isLoading, isFetching, isSuccess, dataUpdatedAt } = useQuery({
    queryKey: ['clients', userId, dbPage, debouncedSearch, isViewingArchived],
    queryFn: async () => {
      if (!userId) return [];
      
      try {
        const hasActiveSearch = debouncedSearch.trim().length > 0;
        const pageSize = hasActiveSearch ? SEARCH_PAGE_SIZE : CLIENTS_PER_PAGE;
        const from = dbPage * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
          .from('clients')
          .select(`
            id, name, phone, email, device, dns, expiration_date, expiration_datetime,
            plan_id, plan_name, plan_price, premium_price,
            server_id, server_name, login, password,
            server_id_2, server_name_2, login_2, password_2,
            premium_password, category, is_paid, pending_amount, notes,
            has_paid_apps, paid_apps_duration, paid_apps_expiration,
            telegram, is_archived, archived_at, created_at, renewed_at,
            gerencia_app_mac, gerencia_app_devices,
            app_name, app_type, device_model, additional_servers,
            is_test, is_integrated
          `)
          .eq('seller_id', userId);

        if (isViewingArchived) {
          query = query.eq('is_archived', true);
        } else {
          query = query.or('is_archived.is.null,is_archived.eq.false');
        }

        const raw = debouncedSearch.trim();
        if (raw) {
          const orParts = buildSearchFilter(raw);
          query = query.or(orParts.join(','));
        }

        const { data, error } = await query
          .order(isViewingArchived ? 'archived_at' : 'created_at', { ascending: false })
          .range(from, to);
        
        if (error) {
          console.error('[useClientQueries] fetchedClients error:', error.message);
          return [];
        }
        
        return hydrateClients(data || []);
      } catch (err) {
        console.error('[useClientQueries] fetchedClients exception:', err);
        return [];
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  // ============= Query: Todos os Logins para Busca =============
  const { data: allClientsForSearch = [] } = useQuery({
    queryKey: ['clients-all-for-search', userId, isViewingArchived],
    queryFn: async () => {
      if (!userId) return [];
      
      try {
        let query = supabase
          .from('clients')
          .select('id, login, login_2')
          .eq('seller_id', userId)
          .limit(1000);
        
        if (isViewingArchived) {
          query = query.eq('is_archived', true);
        } else {
          query = query.or('is_archived.is.null,is_archived.eq.false');
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('[useClientQueries] allClientsForSearch error:', error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error('[useClientQueries] allClientsForSearch exception:', err);
        return [];
      }
    },
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // ============= Query: Clientes que Batem pelo Login =============
  const missingClientIds = useMemo(() => {
    const loadedIds = new Set(allLoadedClients.map(c => c.id));
    return Array.from(loginMatchingClientIds).filter(id => !loadedIds.has(id));
  }, [loginMatchingClientIds, allLoadedClients]);

  const { data: loginMatchedClients = [] } = useQuery({
    queryKey: ['clients-login-matched', userId, missingClientIds.join(','), isViewingArchived],
    queryFn: async () => {
      if (!userId || missingClientIds.length === 0) return [];
      
      let query = supabase
        .from('clients')
        .select(`
          id, name, phone, email, device, dns, expiration_date, expiration_datetime,
          plan_id, plan_name, plan_price, premium_price,
          server_id, server_name, login, password,
          server_id_2, server_name_2, login_2, password_2,
          premium_password, category, is_paid, pending_amount, notes,
          has_paid_apps, paid_apps_duration, paid_apps_expiration,
          telegram, is_archived, archived_at, created_at, renewed_at,
          gerencia_app_mac, gerencia_app_devices,
          app_name, app_type, device_model, additional_servers,
          is_test, is_integrated
        `)
        .eq('seller_id', userId)
        .in('id', missingClientIds);
      
      if (isViewingArchived) {
        query = query.eq('is_archived', true);
      } else {
        query = query.or('is_archived.is.null,is_archived.eq.false');
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return hydrateClients(data || []);
    },
    enabled: !!userId && missingClientIds.length > 0,
    staleTime: 30_000,
  });

  // ============= Query: Contagem de Arquivados =============
  const { data: archivedClientsCount = 0 } = useQuery({
    queryKey: ['archived-clients-count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('is_archived', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });

  // ============= Query: Clientes com External Apps =============
  const { data: clientsWithExternalApps = [] } = useQuery({
    queryKey: ['clients-with-external-apps', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select('client_id')
        .eq('seller_id', userId!);
      if (error) throw error;
      return [...new Set(data?.map(item => item.client_id) || [])];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  const clientsWithPaidAppsSet = useMemo(() => new Set(clientsWithExternalApps), [clientsWithExternalApps]);

  // ============= Efeitos de Sincronização =============
  
  // Atualizar contagem total
  useEffect(() => {
    if (clientCount !== undefined) {
      setTotalClientCount(clientCount);
      setHasMoreClients(allLoadedClients.length < clientCount);
    }
  }, [clientCount, allLoadedClients.length]);

  // Reset quando busca ou filtro muda
  useEffect(() => {
    if (!userId) return;
    setDbPage(0);
    setAllLoadedClients([]);
    setHasMoreClients(true);
  }, [debouncedSearch, userId, isViewingArchived]);

  // Acumular clientes carregados
  useEffect(() => {
    if (!isSuccess) return;
    
    const hasActiveSearch = debouncedSearch.trim().length > 0;
    const currentPageSize = hasActiveSearch ? SEARCH_PAGE_SIZE : CLIENTS_PER_PAGE;
    
    if (dbPage === 0) {
      setAllLoadedClients(fetchedClients);
      setHasMoreClients(fetchedClients.length >= currentPageSize);
    } else {
      setAllLoadedClients(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newClients = fetchedClients.filter(c => !existingIds.has(c.id));
        if (newClients.length === 0) return prev;
        return [...prev, ...newClients];
      });
      
      setHasMoreClients(fetchedClients.length >= currentPageSize);
    }
  }, [fetchedClients, dbPage, isSuccess, dataUpdatedAt, debouncedSearch]);

  // Reset quando usuário muda
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (userId && userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId;
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);
    }
  }, [userId]);

  // Auto-carregar todos quando total é pequeno
  useEffect(() => {
    if (!userId) return;
    if (debouncedSearch.trim()) return;
    if (totalClientCount <= 0) return;
    if (totalClientCount > AUTOLOAD_ALL_UP_TO) return;
    if (!hasMoreClients) return;
    if (isFetching || isLoading) return;
    if (allLoadedClients.length >= totalClientCount) return;

    const t = window.setTimeout(() => {
      setDbPage(prev => prev + 1);
    }, 50);
    return () => window.clearTimeout(t);
  }, [userId, debouncedSearch, totalClientCount, hasMoreClients, isFetching, isLoading, allLoadedClients.length]);

  // ============= Combinar Clientes =============
  const clients = useMemo(() => {
    if (loginMatchedClients.length === 0) return allLoadedClients;
    
    const loadedIds = new Set(allLoadedClients.map(c => c.id));
    const extraClients = loginMatchedClients.filter(c => !loadedIds.has(c.id));
    
    if (extraClients.length === 0) return allLoadedClients;
    return [...allLoadedClients, ...extraClients];
  }, [allLoadedClients, loginMatchedClients]);

  // ============= Funções de Paginação =============
  const loadMoreClients = useCallback(() => {
    if (hasMoreClients && !isFetching) {
      setDbPage(prev => prev + 1);
    }
  }, [hasMoreClients, isFetching]);

  const goToPage = useCallback((page: number, loadAll = false) => {
    const hasActiveSearch = debouncedSearch.trim().length > 0;
    const pageSize = hasActiveSearch ? SEARCH_PAGE_SIZE : CLIENTS_PER_PAGE;
    const targetPage = page - 1;
    
    if (loadAll && targetPage > dbPage) {
      // Carregar todas as páginas até a desejada
      for (let p = dbPage + 1; p <= targetPage; p++) {
        setDbPage(p);
      }
    } else {
      setDbPage(targetPage);
    }
  }, [dbPage, debouncedSearch]);

  const currentPage = useMemo(() => {
    const hasActiveSearch = debouncedSearch.trim().length > 0;
    const pageSize = hasActiveSearch ? SEARCH_PAGE_SIZE : CLIENTS_PER_PAGE;
    return Math.floor(allLoadedClients.length / pageSize) + 1;
  }, [allLoadedClients.length, debouncedSearch]);

  const resetPagination = useCallback(() => {
    setDbPage(0);
    setAllLoadedClients([]);
    setHasMoreClients(true);
  }, []);

  // ============= Return =============
  return {
    // Dados principais
    clients,
    allLoadedClients,
    totalClientCount,
    archivedClientsCount,
    
    // Estados de loading
    isLoading,
    isFetching,
    isSuccess,
    
    // Paginação
    dbPage,
    hasMoreClients,
    loadMoreClients,
    goToPage,
    currentPage,
    
    // Dados para busca por login
    allClientsForSearch,
    loginMatchingClientIds,
    setLoginMatchingClientIds,
    
    // External apps
    clientsWithExternalApps,
    clientsWithPaidAppsSet,
    
    // Reset
    resetPagination,
    setAllLoadedClients,
  };
}

export default useClientQueries;
