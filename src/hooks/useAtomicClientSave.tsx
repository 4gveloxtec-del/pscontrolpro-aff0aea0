/**
 * Atomic Client Save Hook
 * 
 * High-level hook that combines data preparation (encryption, fingerprint)
 * with atomic save operations. This is a facade over useClientMutations
 * that handles all the pre-processing required by Clients.tsx.
 * 
 * Use this hook instead of useClientMutations when you need:
 * - Automatic encryption of credentials
 * - Fingerprint generation
 * - Shared credit handling
 * - Panel entries generation
 */

import { useCallback } from 'react';
import { useClientMutations, ClientSavePayload, SaveResult } from './useClientMutations';
import { useCrypto } from './useCrypto';
import { useFingerprint } from './useFingerprint';

interface ExternalApp {
  appId: string;
  email?: string;
  password?: string;
  expirationDate?: string;
  devices: Array<{ mac: string; model?: string; name?: string; device_key?: string }>;
}

interface PremiumAccount {
  planId?: string;
  planName: string;
  email?: string;
  password?: string;
  price?: string;
  expirationDate?: string;
  notes?: string;
}

interface ServerAppConfig {
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

// Use the same SharedCreditSelection type from SharedCreditPicker for compatibility
import type { SharedCreditSelection } from '@/components/SharedCreditPicker';

export interface AtomicSaveParams {
  // Core data
  clientData: Record<string, unknown>;
  clientId?: string;
  sellerId: string;
  
  // Related data
  externalApps?: ExternalApp[];
  premiumAccounts?: PremiumAccount[];
  serverAppsConfig?: ServerAppConfig[];
  
  // Server/Credit options
  serverId?: string;
  serverName?: string;
  category?: string;
  screens?: number;
  isServerCreditBased?: boolean;
  selectedSharedCredit?: SharedCreditSelection | null;
  
  // Welcome message
  sendWelcomeMessage?: boolean;
  customWelcomeMessage?: string | null;
}

export interface UseAtomicClientSaveOptions {
  onSuccess?: (result: SaveResult, isUpdate: boolean) => void;
  onError?: (error: Error) => void;
  onCreateSuccess?: (result: SaveResult) => void;
  onUpdateSuccess?: (result: SaveResult) => void;
}

export function useAtomicClientSave(options?: UseAtomicClientSaveOptions) {
  const { encrypt } = useCrypto();
  const { generateFingerprint } = useFingerprint();
  
  const {
    createClient,
    updateClient,
    isCreating,
    isUpdating,
    isSaving,
    invalidateClientCaches,
  } = useClientMutations(options);

  /**
   * Prepare external apps by encrypting passwords
   */
  const prepareExternalApps = useCallback(async (apps: ExternalApp[]): Promise<ClientSavePayload['externalApps']> => {
    if (!apps || apps.length === 0) return [];
    
    const prepared = await Promise.all(
      apps.map(async (app) => {
        let encryptedPassword = app.password || '';
        if (encryptedPassword) {
          try {
            encryptedPassword = await encrypt(encryptedPassword);
          } catch (e) {
            console.error('[AtomicSave] Failed to encrypt app password:', e);
          }
        }
        
        return {
          appId: app.appId,
          email: app.email,
          password: encryptedPassword,
          expirationDate: app.expirationDate,
          devices: app.devices.map(d => ({ mac: d.mac, model: d.model || d.name })),
        };
      })
    );
    
    return prepared;
  }, [encrypt]);

  /**
   * Prepare server app credentials by encrypting passwords
   */
  const prepareServerAppsConfig = useCallback(async (configs: ServerAppConfig[]): Promise<ClientSavePayload['serverAppsConfig']> => {
    if (!configs || configs.length === 0) return [];
    
    const prepared = await Promise.all(
      configs.map(async (config) => {
        const encryptedApps = await Promise.all(
          config.apps.map(async (app) => {
            let encryptedPassword = app.password || '';
            if (encryptedPassword) {
              try {
                encryptedPassword = await encrypt(encryptedPassword);
              } catch (e) {
                console.error('[AtomicSave] Failed to encrypt server app password:', e);
              }
            }
            return {
              serverAppId: app.serverAppId,
              authCode: app.authCode,
              username: app.username,
              password: encryptedPassword,
              provider: app.provider,
            };
          })
        );
        
        return {
          serverId: config.serverId,
          apps: encryptedApps,
        };
      })
    );
    
    return prepared;
  }, [encrypt]);

  /**
   * Generate panel entries based on server type and screens
   */
  const generatePanelEntries = useCallback((
    serverId: string | undefined,
    category: string | undefined,
    screens: number,
    isServerCreditBased: boolean,
    serverName?: string
  ): ClientSavePayload['panelEntries'] => {
    if (!serverId || !isServerCreditBased) return [];
    
    const entries: ClientSavePayload['panelEntries'] = [];
    const isP2P = category === 'P2P';
    const isWplay = serverName?.toUpperCase() === 'WPLAY';
    
    if (isP2P) {
      // P2P client - all screens are P2P
      for (let i = 0; i < screens; i++) {
        entries.push({ panel_id: serverId, slot_type: 'p2p' });
      }
    } else if (isWplay && screens === 3) {
      // WPLAY 3 screens = 2 IPTV + 1 P2P
      entries.push(
        { panel_id: serverId, slot_type: 'iptv' },
        { panel_id: serverId, slot_type: 'iptv' },
        { panel_id: serverId, slot_type: 'p2p' }
      );
    } else {
      // All IPTV
      for (let i = 0; i < screens; i++) {
        entries.push({ panel_id: serverId, slot_type: 'iptv' });
      }
    }
    
    return entries;
  }, []);

  /**
   * Encrypt main client credentials and generate fingerprint
   */
  const prepareClientCredentials = useCallback(async (
    clientData: Record<string, unknown>,
    sharedCredit?: SharedCreditSelection | null
  ): Promise<Record<string, unknown>> => {
    const data = { ...clientData };
    const login = (data.login as string) || '';
    const password = (data.password as string) || '';
    
    // If using shared credit, use pre-encrypted credentials
    if (sharedCredit?.encryptedLogin) {
      data.login = sharedCredit.encryptedLogin;
      data.password = sharedCredit.encryptedPassword || null;
      if (login) {
        data.credentials_fingerprint = await generateFingerprint(login, password);
      }
      return data;
    }
    
    // Encrypt new credentials
    if (login) {
      try {
        const [encryptedLogin, encryptedPassword, fingerprint] = await Promise.all([
          encrypt(login),
          password ? encrypt(password) : Promise.resolve(null),
          generateFingerprint(login, password),
        ]);
        
        data.login = encryptedLogin;
        data.password = encryptedPassword;
        data.credentials_fingerprint = fingerprint;
      } catch (e) {
        console.error('[AtomicSave] Failed to encrypt credentials:', e);
        throw new Error('Falha ao criptografar credenciais');
      }
    } else {
      data.login = null;
      data.password = null;
      data.credentials_fingerprint = null;
    }
    
    return data;
  }, [encrypt, generateFingerprint]);

  /**
   * Save client atomically (create or update)
   */
  const saveClient = useCallback(async (params: AtomicSaveParams): Promise<SaveResult> => {
    const {
      clientData,
      clientId,
      sellerId,
      externalApps = [],
      premiumAccounts = [],
      serverAppsConfig = [],
      serverId,
      serverName,
      category,
      screens = 1,
      isServerCreditBased = false,
      selectedSharedCredit,
      sendWelcomeMessage,
      customWelcomeMessage,
    } = params;
    
    const isUpdate = !!clientId;
    
    // Prepare all data in parallel
    const [
      preparedClientData,
      preparedExternalApps,
      preparedServerAppsConfig,
    ] = await Promise.all([
      prepareClientCredentials(clientData, selectedSharedCredit),
      prepareExternalApps(externalApps),
      prepareServerAppsConfig(serverAppsConfig),
    ]);
    
    // Generate panel entries for new clients only (if using credit-based server)
    const panelEntries = isUpdate 
      ? [] 
      : generatePanelEntries(serverId, category, screens, isServerCreditBased, serverName);
    
    // Prepare premium accounts (no encryption needed for these)
    const preparedPremiumAccounts = premiumAccounts.map(acc => ({
      planName: acc.planName,
      email: acc.email,
      password: acc.password,
      price: acc.price,
      expirationDate: acc.expirationDate,
      notes: acc.notes,
    }));
    
    // Build payload
    const payload: ClientSavePayload = {
      clientData: preparedClientData,
      clientId,
      sellerId,
      externalApps: preparedExternalApps,
      premiumAccounts: preparedPremiumAccounts,
      serverAppsConfig: preparedServerAppsConfig,
      panelEntries: isUpdate ? undefined : panelEntries,
      sendWelcomeMessage,
      customWelcomeMessage,
    };
    
    // Execute save
    if (isUpdate) {
      return await updateClient(payload);
    } else {
      return await createClient(payload);
    }
  }, [
    prepareClientCredentials,
    prepareExternalApps,
    prepareServerAppsConfig,
    generatePanelEntries,
    createClient,
    updateClient,
  ]);

  return {
    saveClient,
    isCreating,
    isUpdating,
    isSaving,
    invalidateClientCaches,
  };
}

export type { ExternalApp, PremiumAccount, ServerAppConfig, SharedCreditSelection };
