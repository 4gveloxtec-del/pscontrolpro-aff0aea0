/**
 * useClientLookup - Hook para Consulta 360° de Clientes
 * 
 * Extrai toda a lógica do modal de lookup do Clients.tsx:
 * - Estados do modal (showLookupDialog, lookupSearchQuery, etc.)
 * - Queries de busca (lookupAllClients, lookupPhoneClients, etc.)
 * - Lógica de descriptografia automática
 * - Agrupamento por telefone
 * 
 * Etapa 2.6 do plano de refatoração
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeWhatsAppNumber } from '@/lib/utils';
import { differenceInDays, startOfToday } from 'date-fns';

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

  // Estados de descriptografia de logins para busca
  const [lookupDecryptedLogins, setLookupDecryptedLogins] = useState<Record<string, { login: string; login_2: string }>>({});
  const [isDecryptingLookupLogins, setIsDecryptingLookupLogins] = useState(false);

  // ============= Heurística de criptografia =============
  const lookupLooksEncrypted = useCallback((value: string) => {
    if (value.length < 20) return false;
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(value)) return false;
    if (!/[A-Za-z]/.test(value)) return false;
    const hasUpperAndLower = /[A-Z]/.test(value) && /[a-z]/.test(value);
    const hasPadding = value.endsWith('=');
    const hasSpecialBase64 = /[+/]/.test(value);
    return hasUpperAndLower || hasPadding || hasSpecialBase64;
  }, []);

  // ============= Query: Todos os clientes para busca =============
  const { data: lookupAllClients = [], isLoading: isLoadingLookupAllClients } = useQuery({
    queryKey: ['client-lookup-all', userId, isAdmin],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from('clients')
        .select('id, seller_id, name, phone, email, login, login_2, expiration_date, plan_name, is_archived, created_at')
        .order('expiration_date', { ascending: false })
        .limit(1000);

      // Resellers see only their own data; admins can search across all resellers.
      if (!isAdmin) {
        query = query.eq('seller_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LookupClientBasic[];
    },
    enabled: !!userId && showLookupDialog,
    staleTime: 60_000,
  });

  // ============= Descriptografar logins para busca =============
  useEffect(() => {
    if (!showLookupDialog) return;
    if (lookupAllClients.length === 0) return;
    if (isDecryptingLookupLogins) return;

    // Only decrypt missing entries
    const missing = lookupAllClients.filter((c) => !lookupDecryptedLogins[c.id]);
    if (missing.length === 0) return;

    const run = async () => {
      setIsDecryptingLookupLogins(true);
      const next: Record<string, { login: string; login_2: string }> = { ...lookupDecryptedLogins };

      const safeDecrypt = async (value: string | null): Promise<string> => {
        if (!value) return '';
        if (!lookupLooksEncrypted(value)) return value;
        try {
          const decrypted = await decrypt(value);
          if (decrypted === value) return value;
          if (lookupLooksEncrypted(decrypted)) return value;
          return decrypted;
        } catch {
          return value;
        }
      };

      // Decrypt in small batches to avoid throttling
      const batchSize = 20;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (client) => {
            const [login, login_2] = await Promise.all([
              safeDecrypt(client.login ?? null),
              safeDecrypt(client.login_2 ?? null),
            ]);
            next[client.id] = { login, login_2 };
          })
        );
      }

      setLookupDecryptedLogins(next);
      setIsDecryptingLookupLogins(false);
    };

    run();
  }, [showLookupDialog, lookupAllClients, decrypt, lookupDecryptedLogins, isDecryptingLookupLogins, lookupLooksEncrypted]);

  // ============= Resultados de busca filtrados =============
  const lookupSearchResultsRaw = useMemo(() => {
    if (!lookupSearchQuery || lookupSearchQuery.length < 2) return [];

    const normalizedQuery = lookupSearchQuery.toLowerCase().trim();
    const normalizedQueryDigits = normalizedQuery.replace(/\D/g, '');

    return lookupAllClients
      .filter((client) => {
        // Name
        if ((client.name || '').toLowerCase().includes(normalizedQuery)) return true;

        // Email
        if ((client.email || '').toLowerCase().includes(normalizedQuery)) return true;

        // Plan name (to find by plan type like "SSH", "IPTV")
        if ((client.plan_name || '').toLowerCase().includes(normalizedQuery)) return true;

        // Phone (digits + plain text)
        if (client.phone) {
          const phoneText = String(client.phone).toLowerCase();
          const phoneDigits = String(client.phone).replace(/\D/g, '');
          if (normalizedQueryDigits.length >= 4 && phoneDigits.includes(normalizedQueryDigits)) return true;
          if (normalizedQueryDigits.length >= 4 && phoneDigits.length >= 12 && phoneDigits.slice(2).includes(normalizedQueryDigits)) return true;
          if (phoneText.includes(normalizedQuery)) return true;
        }

        // Login (decrypted first, raw fallback)
        const decrypted = lookupDecryptedLogins[client.id];
        const login = (decrypted?.login ?? client.login ?? '').toLowerCase();
        const login2 = (decrypted?.login_2 ?? client.login_2 ?? '').toLowerCase();
        if (login.includes(normalizedQuery) || login2.includes(normalizedQuery)) return true;

        return false;
      })
      .slice(0, 50);
  }, [lookupSearchQuery, lookupAllClients, lookupDecryptedLogins]);

  const isLookupSearching = isLoadingLookupAllClients || isDecryptingLookupLogins;

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

      // Fetch related data for each client in parallel
      const enrichedClients = await Promise.all(
        filtered.map(async (client) => {
          const [externalAppsResult, premiumAccountsResult, messageHistoryResult, deviceAppsResult, serverAppsCredsResult] = await Promise.all([
            supabase
              .from('client_external_apps')
              .select('id, email, password, expiration_date, devices, notes, fixed_app_name, external_app:external_apps(name, download_url)')
              .eq('client_id', client.id)
              .eq('seller_id', userId),
            supabase
              .from('client_premium_accounts')
              .select('id, plan_name, email, password, expiration_date, price, notes')
              .eq('client_id', client.id)
              .eq('seller_id', userId),
            supabase
              .from('message_history')
              .select('id, message_type, message_content, sent_at')
              .eq('client_id', client.id)
              .eq('seller_id', userId)
              .order('sent_at', { ascending: false })
              .limit(5),
            supabase
              .from('client_device_apps')
              .select('id, app:reseller_device_apps(name, icon, download_url)')
              .eq('client_id', client.id)
              .eq('seller_id', userId),
            supabase
              .from('client_server_app_credentials')
              .select('id, auth_code, username, password, provider, notes, server_app:server_apps(name, auth_type)')
              .eq('client_id', client.id)
              .eq('seller_id', userId),
          ]);

          return {
            ...client,
            external_apps: externalAppsResult.data || [],
            premium_accounts: premiumAccountsResult.data || [],
            message_history: messageHistoryResult.data || [],
            device_apps: deviceAppsResult.data || [],
            server_app_credentials: serverAppsCredsResult.data || [],
          };
        })
      );

      return enrichedClients;
    },
    enabled: !!userId && !!selectedLookupPhone && showLookupDialog,
    staleTime: 30000,
  });

  // ============= Query: Cliente individual (legacy) =============
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

  // ============= Descriptografia automática do cliente selecionado =============
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
        if (!lookupLooksEncrypted(value)) return value;
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
        return lookupLooksEncrypted(original) && lookupLooksEncrypted(result);
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
  }, [showLookupDialog, lookupClientData, decrypt, lookupDecryptAttempt, lookupLooksEncrypted]);

  // ============= Descriptografia para visão por telefone =============
  useEffect(() => {
    if (!showLookupDialog || !selectedLookupPhone || lookupPhoneClients.length === 0) {
      return;
    }

    const maybeDecrypt = async (value: string | null): Promise<string> => {
      if (!value) return '';
      if (!lookupLooksEncrypted(value)) return value;
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
  }, [showLookupDialog, selectedLookupPhone, lookupPhoneClients, decrypt, lookupLooksEncrypted, lookupPhoneDecryptedCreds]);

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
    lookupAllClients,
    lookupSearchResultsRaw,
    lookupGroupedResults,
    lookupPhoneClients,
    lookupClientData,

    // Loading states
    isLoadingLookupAllClients,
    isLoadingLookupPhoneClients,
    isLoadingLookupClient,
    isLookupSearching,

    // Helpers
    getLookupStatusBadge,

    // Ações
    openLookupDialog,
    closeLookupDialog,
    selectPhone,
    selectClient,
    goBackToSearch,
  };
}

// Export do tipo para uso no componente principal
export type { LookupClientBasic, LookupDecryptedCreds, LookupPhoneGroup };
