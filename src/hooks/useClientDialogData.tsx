/**
 * Client Dialog Data Hook
 * 
 * Optimized data loading for client edit/create dialogs.
 * Loads all required data in parallel when dialog opens.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useCrypto } from '@/hooks/useCrypto';

interface ServerData {
  id: string;
  name: string;
  is_active: boolean;
  is_credit_based: boolean;
  panel_url: string | null;
  icon_url: string | null;
  iptv_per_credit: number;
  p2p_per_credit: number;
  total_screens_per_credit: number;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  is_active: boolean;
  category: string;
}

interface ClientCategory {
  id: string;
  name: string;
  seller_id: string;
}

interface ExternalAppData {
  id: string;
  email: string | null;
  password: string | null;
  expiration_date: string | null;
  devices: Array<{ mac: string; model?: string }> | null;
  external_app_id: string | null;
  fixed_app_name: string | null;
}

interface PremiumAccountData {
  id: string;
  plan_name: string;
  email: string | null;
  password: string | null;
  price: number | null;
  expiration_date: string | null;
  notes: string | null;
}

interface ServerAppCredentialData {
  id: string;
  server_id: string;
  server_app_id: string;
  auth_code: string | null;
  username: string | null;
  password: string | null;
  provider: string | null;
}

const DEFAULT_CATEGORIES = ['IPTV', 'P2P', 'Contas Premium', 'SSH', 'Revendedor'] as const;

export function useClientDialogData(userId: string | undefined, isOpen: boolean) {
  const { decrypt } = useCrypto();
  const [isLoadingDialog, setIsLoadingDialog] = useState(false);
  const loadStartedRef = useRef(false);

  // Reset loading flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      loadStartedRef.current = false;
    }
  }, [isOpen]);

  // Plans query - lazy loaded
  const { data: plans = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ['plans-dialog', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, price, duration_days, is_active, category')
        .eq('seller_id', userId)
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!userId && isOpen,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  // Servers query - lazy loaded
  const { data: servers = [], isLoading: isLoadingServers } = useQuery({
    queryKey: ['servers-dialog', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active, is_credit_based, panel_url, icon_url, iptv_per_credit, p2p_per_credit, total_screens_per_credit')
        .eq('seller_id', userId)
        .order('name');
      if (error) throw error;
      return data as ServerData[];
    },
    enabled: !!userId && isOpen,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  // Categories query - lazy loaded
  const { data: customCategories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['client-categories-dialog', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('client_categories')
        .select('id, name, seller_id')
        .eq('seller_id', userId)
        .order('name');
      if (error) throw error;
      return data as ClientCategory[];
    },
    enabled: !!userId && isOpen,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  // Combine categories
  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name)];
  const activeServers = servers.filter(s => s.is_active);

  // Load client related data for editing
  const loadClientRelatedData = useCallback(async (clientId: string): Promise<{
    externalApps: ExternalAppData[];
    premiumAccounts: PremiumAccountData[];
    serverAppCredentials: ServerAppCredentialData[];
  }> => {
    if (!userId || !clientId) {
      return { externalApps: [], premiumAccounts: [], serverAppCredentials: [] };
    }

    // Load all related data in parallel
    const [externalAppsResult, premiumAccountsResult, serverAppCredsResult] = await Promise.all([
      supabase
        .from('client_external_apps')
        .select('id, email, password, expiration_date, devices, external_app_id, fixed_app_name')
        .eq('client_id', clientId)
        .eq('seller_id', userId),
      supabase
        .from('client_premium_accounts')
        .select('id, plan_name, email, password, price, expiration_date, notes')
        .eq('client_id', clientId)
        .eq('seller_id', userId),
      supabase
        .from('client_server_app_credentials')
        .select('id, server_id, server_app_id, auth_code, username, password, provider')
        .eq('client_id', clientId)
        .eq('seller_id', userId),
    ]);

    return {
      externalApps: (externalAppsResult.data || []) as ExternalAppData[],
      premiumAccounts: (premiumAccountsResult.data || []) as PremiumAccountData[],
      serverAppCredentials: (serverAppCredsResult.data || []) as ServerAppCredentialData[],
    };
  }, [userId]);

  // Decrypt client credentials
  const decryptCredentials = useCallback(async (
    login: string | null,
    password: string | null,
    login_2: string | null,
    password_2: string | null
  ): Promise<{ login: string; password: string; login_2: string; password_2: string }> => {
    const looksEncrypted = (value: string) => {
      if (value.length < 20) return false;
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      if (!base64Regex.test(value)) return false;
      if (!/[A-Za-z]/.test(value)) return false;
      const hasUpperAndLower = /[A-Z]/.test(value) && /[a-z]/.test(value);
      const hasPadding = value.endsWith('=');
      const hasSpecialBase64 = /[+/]/.test(value);
      return hasUpperAndLower || hasPadding || hasSpecialBase64;
    };

    const safeDecrypt = async (value: string | null): Promise<string> => {
      if (!value) return '';
      if (!looksEncrypted(value)) return value;
      try {
        const result = await decrypt(value);
        if (result === value || looksEncrypted(result)) return value;
        return result;
      } catch {
        return value;
      }
    };

    const [decLogin, decPassword, decLogin2, decPassword2] = await Promise.all([
      safeDecrypt(login),
      safeDecrypt(password),
      safeDecrypt(login_2),
      safeDecrypt(password_2),
    ]);

    return {
      login: decLogin,
      password: decPassword,
      login_2: decLogin2,
      password_2: decPassword2,
    };
  }, [decrypt]);

  const isLoading = isLoadingPlans || isLoadingServers || isLoadingCategories;

  return {
    plans,
    servers,
    activeServers,
    customCategories,
    allCategories,
    isLoading,
    loadClientRelatedData,
    decryptCredentials,
  };
}

export type { ServerData, Plan, ClientCategory, ExternalAppData, PremiumAccountData, ServerAppCredentialData };
