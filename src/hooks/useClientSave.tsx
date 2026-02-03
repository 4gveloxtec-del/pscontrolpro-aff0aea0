/**
 * Client Save Hook
 * 
 * Encapsulates ALL client save logic extracted from Clients.tsx (Step 2.12).
 * This is a facade that combines:
 * - useAtomicClientSave for atomic transactional operations
 * - Welcome message preview flow management
 * - Form reset and dialog state control
 * 
 * IMPORTANT: This hook uses the atomic save path exclusively.
 * The legacy mutation path has been deprecated.
 * 
 * @see useAtomicClientSave for lower-level atomic operations
 * @see useClientMutations for direct mutation access
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAtomicClientSave, AtomicSaveParams } from './useAtomicClientSave';
import { useCrypto } from './useCrypto';
import type { Client, ServerData, AdditionalServer, MacDevice } from '@/types/clients';
import type { SharedCreditSelection } from '@/components/SharedCreditPicker';

// Form data structure matching Clients.tsx
export interface ClientFormDataForSave {
  name: string;
  phone: string;
  telegram: string;
  email: string;
  device: string;
  dns: string;
  expiration_date: string;
  plan_id: string;
  plan_name: string;
  plan_price: string;
  premium_price: string;
  server_id: string;
  server_name: string;
  login: string;
  password: string;
  server_id_2: string;
  server_name_2: string;
  login_2: string;
  password_2: string;
  premium_password: string;
  category: string;
  is_paid: boolean;
  pending_amount: string;
  expected_payment_date: string;
  notes: string;
  has_paid_apps: boolean;
  paid_apps_duration: string;
  paid_apps_expiration: string;
  paid_apps_email: string;
  paid_apps_password: string;
  gerencia_app_mac: string;
  gerencia_app_devices: MacDevice[];
  app_name: string;
  app_type: string;
  device_model: string;
  has_adult_content: boolean;
  screens: string;
}

export interface ExternalAppForSave {
  appId: string;
  email?: string;
  password?: string;
  expirationDate?: string;
  devices: Array<{ mac: string; model?: string; name?: string; device_key?: string }>;
}

export interface PremiumAccountForSave {
  planId?: string;
  planName: string;
  email?: string;
  password?: string;
  price?: string;
  expirationDate?: string;
  notes?: string;
}

export interface ServerAppConfigForSave {
  serverId: string;
  serverName: string;
  apps: Array<{
    serverAppId: string;
    authCode?: string;
    username?: string;
    password?: string;
    provider?: string;
  }>;
}

// SharedCreditSelection is imported from SharedCreditPicker
// Pending client data for welcome message flow
export interface PendingClientData {
  data: Record<string, unknown>;
  screens: string;
}

export interface UseClientSaveOptions {
  userId: string | undefined;
  servers: ServerData[];
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useClientSave({
  userId,
  servers,
  onSuccess,
  onError,
}: UseClientSaveOptions) {
  const { encrypt } = useCrypto();
  const queryClient = useQueryClient();
  
  // Welcome message preview state
  const [showWelcomePreview, setShowWelcomePreview] = useState(false);
  const [pendingClientData, setPendingClientData] = useState<PendingClientData | null>(null);
  const [customWelcomeMessage, setCustomWelcomeMessage] = useState<string | null>(null);
  
  // Atomic save hook
  const {
    saveClient: atomicSaveClient,
    isSaving,
    isCreating,
    isUpdating,
    invalidateClientCaches,
  } = useAtomicClientSave({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      onError?.(error);
    },
  });

  /**
   * Build client data object from form data
   */
  const buildClientData = useCallback(async (
    formData: ClientFormDataForSave,
    additionalServers: AdditionalServer[],
    premiumAccounts: PremiumAccountForSave[],
  ): Promise<Record<string, unknown>> => {
    // For Contas Premium, calculate total price from premium accounts
    const isPremiumCategory = formData.category === 'Contas Premium';
    const premiumTotalPrice = isPremiumCategory 
      ? premiumAccounts.reduce((sum, acc) => sum + (parseFloat(acc.price || '0') || 0), 0)
      : null;
    
    // Get the earliest expiration date from premium accounts if category is Premium
    const premiumExpirationDate = isPremiumCategory && premiumAccounts.length > 0
      ? premiumAccounts
          .filter(acc => acc.expirationDate)
          .sort((a, b) => new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime())[0]?.expirationDate
      : null;

    // Encrypt second server credentials in parallel
    const hasSecondServer = formData.login_2 || formData.password_2;
    let encryptedLogin2: string | null = null;
    let encryptedPassword2: string | null = null;
    
    if (hasSecondServer) {
      const [login2, password2] = await Promise.all([
        formData.login_2 ? encrypt(formData.login_2).catch(() => formData.login_2) : Promise.resolve(null),
        formData.password_2 ? encrypt(formData.password_2).catch(() => formData.password_2) : Promise.resolve(null),
      ]);
      encryptedLogin2 = login2;
      encryptedPassword2 = password2;
    }

    // Encrypt additional servers in parallel
    const validAdditionalServers = await Promise.all(
      additionalServers
        .filter(s => s.server_id)
        .map(async (server) => {
          const [login, password] = await Promise.all([
            server.login ? encrypt(server.login).catch(() => server.login) : Promise.resolve(null),
            server.password ? encrypt(server.password).catch(() => server.password) : Promise.resolve(null),
          ]);
          return { server_id: server.server_id, server_name: server.server_name, login, password };
        })
    );

    return {
      name: formData.name,
      phone: formData.phone || null,
      telegram: formData.telegram || null,
      email: formData.email || null,
      device: formData.device || null,
      dns: formData.dns || null,
      expiration_date: isPremiumCategory && premiumExpirationDate ? premiumExpirationDate : formData.expiration_date,
      plan_id: formData.plan_id || null,
      plan_name: formData.plan_name || null,
      plan_price: isPremiumCategory ? premiumTotalPrice : (formData.plan_price ? parseFloat(formData.plan_price) : null),
      premium_price: formData.premium_price ? parseFloat(formData.premium_price) : null,
      server_id: formData.server_id || null,
      server_name: formData.server_name || null,
      login: formData.login || null,
      password: formData.password || null,
      server_id_2: formData.server_id_2 || null,
      server_name_2: formData.server_name_2 || null,
      login_2: encryptedLogin2,
      password_2: encryptedPassword2,
      premium_password: formData.premium_password || null,
      category: formData.category || 'IPTV',
      is_paid: formData.is_paid,
      pending_amount: formData.pending_amount ? parseFloat(formData.pending_amount) : 0,
      expected_payment_date: !formData.is_paid && formData.expected_payment_date ? formData.expected_payment_date : null,
      notes: formData.notes || null,
      has_paid_apps: formData.has_paid_apps || false,
      paid_apps_duration: formData.paid_apps_duration || null,
      paid_apps_expiration: formData.paid_apps_expiration || null,
      paid_apps_email: formData.paid_apps_email || null,
      paid_apps_password: formData.paid_apps_password || null,
      gerencia_app_mac: formData.gerencia_app_devices.length > 0 ? formData.gerencia_app_devices[0].mac : (formData.gerencia_app_mac || null),
      gerencia_app_devices: formData.gerencia_app_devices.filter(d => d.mac.trim() !== ''),
      app_name: formData.app_name || null,
      app_type: formData.app_type || 'server',
      device_model: formData.device_model || null,
      additional_servers: validAdditionalServers,
      has_adult_content: formData.has_adult_content || false,
    };
  }, [encrypt]);

  /**
   * Prepare atomic save parameters from form state
   */
  const prepareAtomicParams = useCallback((
    externalApps: ExternalAppForSave[],
    premiumAccounts: PremiumAccountForSave[],
    serverAppsConfig: ServerAppConfigForSave[],
    formData: ClientFormDataForSave,
    isServerCreditBased: boolean,
    selectedSharedCredit: SharedCreditSelection | null,
  ) => ({
    externalApps: externalApps.map(app => ({
      appId: app.appId,
      email: app.email,
      password: app.password,
      expirationDate: app.expirationDate,
      devices: app.devices,
    })),
    premiumAccounts: premiumAccounts.map(acc => ({
      planName: acc.planName,
      email: acc.email,
      password: acc.password,
      price: acc.price,
      expirationDate: acc.expirationDate,
      notes: acc.notes,
    })),
    serverAppsConfig: serverAppsConfig.map(config => ({
      serverId: config.serverId,
      serverName: config.serverName,
      apps: config.apps,
    })),
    serverId: formData.server_id,
    serverName: formData.server_name,
    category: formData.category,
    isServerCreditBased,
    selectedSharedCredit,
  }), []);

  /**
   * Save client (update mode) - direct save without welcome preview
   */
  const saveClientUpdate = useCallback(async (params: {
    clientId: string;
    clientData: Record<string, unknown>;
    externalApps: ExternalAppForSave[];
    premiumAccounts: PremiumAccountForSave[];
    serverAppsConfig: ServerAppConfigForSave[];
    selectedSharedCredit: SharedCreditSelection | null;
  }) => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      await atomicSaveClient({
        clientData: params.clientData,
        clientId: params.clientId,
        sellerId: userId,
        externalApps: params.externalApps.map(app => ({
          appId: app.appId,
          email: app.email,
          password: app.password,
          expirationDate: app.expirationDate,
          devices: app.devices,
        })),
        premiumAccounts: params.premiumAccounts.map(acc => ({
          planName: acc.planName,
          email: acc.email,
          password: acc.password,
          price: acc.price,
          expirationDate: acc.expirationDate,
          notes: acc.notes,
        })),
        serverAppsConfig: params.serverAppsConfig.map(config => ({
          serverId: config.serverId,
          serverName: config.serverName,
          apps: config.apps,
        })),
        selectedSharedCredit: params.selectedSharedCredit,
      });
    } catch (error) {
      console.error('[useClientSave] Atomic update failed:', error);
      throw error;
    }
  }, [userId, atomicSaveClient]);

  /**
   * Save client (create mode) - may show welcome preview first
   */
  const saveClientCreate = useCallback(async (params: {
    clientData: Record<string, unknown>;
    formData: ClientFormDataForSave;
    externalApps: ExternalAppForSave[];
    premiumAccounts: PremiumAccountForSave[];
    serverAppsConfig: ServerAppConfigForSave[];
    selectedSharedCredit: SharedCreditSelection | null;
    isServerCreditBased: boolean;
  }) => {
    if (!userId) throw new Error('Usuário não autenticado');

    const screens = params.formData.screens || '1';

    if (params.formData.phone) {
      // Has phone - show welcome message preview
      const atomicParams = prepareAtomicParams(
        params.externalApps,
        params.premiumAccounts,
        params.serverAppsConfig,
        params.formData,
        params.isServerCreditBased,
        params.selectedSharedCredit,
      );

      setPendingClientData({
        data: {
          ...params.clientData,
          _atomicParams: atomicParams,
        },
        screens,
      });
      setShowWelcomePreview(true);
    } else {
      // No phone - save directly without welcome message
      try {
        await atomicSaveClient({
          clientData: params.clientData,
          sellerId: userId,
          externalApps: params.externalApps.map(app => ({
            appId: app.appId,
            email: app.email,
            password: app.password,
            expirationDate: app.expirationDate,
            devices: app.devices,
          })),
          premiumAccounts: params.premiumAccounts.map(acc => ({
            planName: acc.planName,
            email: acc.email,
            password: acc.password,
            price: acc.price,
            expirationDate: acc.expirationDate,
            notes: acc.notes,
          })),
          serverAppsConfig: params.serverAppsConfig.map(config => ({
            serverId: config.serverId,
            serverName: config.serverName,
            apps: config.apps,
          })),
          serverId: params.formData.server_id,
          serverName: params.formData.server_name,
          category: params.formData.category,
          screens: parseInt(screens),
          isServerCreditBased: params.isServerCreditBased,
          selectedSharedCredit: params.selectedSharedCredit,
          sendWelcomeMessage: false,
        });
      } catch (error) {
        console.error('[useClientSave] Atomic create failed:', error);
        throw error;
      }
    }
  }, [userId, atomicSaveClient, prepareAtomicParams]);

  /**
   * Handle confirmation from welcome message preview
   */
  const handleWelcomeConfirm = useCallback(async (message: string | null, sendWelcome: boolean) => {
    if (!pendingClientData || !userId) return;
    
    setCustomWelcomeMessage(sendWelcome ? (message || '') : null);
    setShowWelcomePreview(false);
    
    const atomicParams = pendingClientData.data._atomicParams as any;
    
    if (atomicParams) {
      const { _atomicParams, ...clientData } = pendingClientData.data;
      
      try {
        await atomicSaveClient({
          clientData,
          sellerId: userId,
          externalApps: atomicParams.externalApps,
          premiumAccounts: atomicParams.premiumAccounts,
          serverAppsConfig: atomicParams.serverAppsConfig,
          serverId: atomicParams.serverId,
          serverName: atomicParams.serverName,
          category: atomicParams.category,
          screens: parseInt(pendingClientData.screens),
          isServerCreditBased: atomicParams.isServerCreditBased,
          selectedSharedCredit: atomicParams.selectedSharedCredit,
          sendWelcomeMessage: sendWelcome,
          customWelcomeMessage: message,
        });
      } catch (error) {
        console.error('[useClientSave] Atomic create with welcome failed:', error);
      }
    }
    
    setPendingClientData(null);
  }, [pendingClientData, userId, atomicSaveClient]);

  /**
   * Cancel welcome preview
   */
  const cancelWelcomePreview = useCallback(() => {
    setShowWelcomePreview(false);
    setPendingClientData(null);
  }, []);

  /**
   * Main submit handler - to be called from form onSubmit
   */
  const handleSubmit = useCallback(async (params: {
    formData: ClientFormDataForSave;
    editingClient: Client | null;
    externalApps: ExternalAppForSave[];
    premiumAccounts: PremiumAccountForSave[];
    additionalServers: AdditionalServer[];
    serverAppsConfig: ServerAppConfigForSave[];
    selectedSharedCredit: SharedCreditSelection | null;
  }) => {
    if (!userId) {
      console.error('[useClientSave] No user ID');
      return;
    }

    const { formData, editingClient, externalApps, premiumAccounts, additionalServers, serverAppsConfig, selectedSharedCredit } = params;

    // Build client data
    const clientData = await buildClientData(formData, additionalServers, premiumAccounts);

    // Determine if server is credit-based
    const server = servers.find(s => s.id === formData.server_id);
    const isServerCreditBased = server?.is_credit_based || false;

    if (editingClient) {
      // Edit mode
      await saveClientUpdate({
        clientId: editingClient.id,
        clientData,
        externalApps,
        premiumAccounts,
        serverAppsConfig,
        selectedSharedCredit,
      });
    } else {
      // Create mode
      await saveClientCreate({
        clientData,
        formData,
        externalApps,
        premiumAccounts,
        serverAppsConfig,
        selectedSharedCredit,
        isServerCreditBased,
      });
    }
  }, [userId, servers, buildClientData, saveClientUpdate, saveClientCreate]);

  return {
    // Main operations
    handleSubmit,
    handleWelcomeConfirm,
    cancelWelcomePreview,
    buildClientData,
    
    // Welcome preview state
    showWelcomePreview,
    pendingClientData,
    customWelcomeMessage,
    setCustomWelcomeMessage,
    
    // Status flags
    isSaving,
    isCreating,
    isUpdating,
    
    // Cache control
    invalidateClientCaches,
  };
}

// Re-export types for external use
export type { SharedCreditSelection };
