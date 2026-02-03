/**
 * useClientCredentials - Hook para Gerenciamento de Credenciais Criptografadas
 * 
 * Extrai toda a lógica de criptografia/descriptografia do Clients.tsx:
 * - Estados de credenciais descriptografadas
 * - Funções de encriptação e decriptação
 * - Busca de credenciais existentes por fingerprint
 * - Auto-descriptografia em lote
 * 
 * Etapa 2.7 do plano de refatoração
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DecryptedCredentials } from '@/types/clients';

// ============= Tipos =============
interface UseClientCredentialsOptions {
  userId: string | undefined;
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
  generateFingerprint: (login: string, password: string) => Promise<string>;
}

interface ClientWithCredentials {
  id: string;
  login: string | null;
  password: string | null;
  login_2?: string | null;
  password_2?: string | null;
}

interface ExistingCredentialsResult {
  encryptedLogin: string;
  encryptedPassword: string;
  clientCount: number;
  fingerprint: string;
}

// ============= Helpers =============

/**
 * Heurística para detectar se um valor está criptografado (base64 válido com características de criptografia)
 */
const looksEncrypted = (value: string): boolean => {
  if (value.length < 20) return false;
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(value)) return false;
  // Valores puramente numéricos não são criptografados
  if (!/[A-Za-z]/.test(value)) return false;
  const hasUpperAndLower = /[A-Z]/.test(value) && /[a-z]/.test(value);
  const hasPadding = value.endsWith('=');
  const hasSpecialBase64 = /[+/]/.test(value);
  return hasUpperAndLower || hasPadding || hasSpecialBase64;
};

// ============= Cache Key =============
const SEARCH_LOGINS_CACHE_KEY = 'busca360_logins_cache';

// ============= Helper: Load cache from sessionStorage =============
const loadSearchLoginsCache = (sellerId: string): Record<string, { login: string; login_2: string }> => {
  try {
    const cached = sessionStorage.getItem(`${SEARCH_LOGINS_CACHE_KEY}_${sellerId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[useClientCredentials] Failed to load cache:', e);
  }
  return {};
};

// ============= Helper: Save cache to sessionStorage =============
const saveSearchLoginsCache = (sellerId: string, data: Record<string, { login: string; login_2: string }>) => {
  try {
    sessionStorage.setItem(`${SEARCH_LOGINS_CACHE_KEY}_${sellerId}`, JSON.stringify(data));
  } catch (e) {
    console.warn('[useClientCredentials] Failed to save cache:', e);
  }
};

// ============= Hook Principal =============
export function useClientCredentials({
  userId,
  encrypt,
  decrypt,
  generateFingerprint,
}: UseClientCredentialsOptions) {
  // ============= Estados =============
  const [decryptedCredentials, setDecryptedCredentials] = useState<DecryptedCredentials>({});
  const [decrypting, setDecrypting] = useState<string | null>(null);
  const [isDecryptingAll, setIsDecryptingAll] = useState(false);
  const [allCredentialsDecrypted, setAllCredentialsDecrypted] = useState(false);

  // Estados para busca por login descriptografado - inicializa do cache
  const [searchDecryptedLogins, setSearchDecryptedLogins] = useState<Record<string, { login: string; login_2: string }>>(() => {
    return userId ? loadSearchLoginsCache(userId) : {};
  });
  const [isDecryptingSearchLogins, setIsDecryptingSearchLogins] = useState(false);
  const searchDecryptInitializedRef = useRef(false);

  // ============= Função de encriptação =============
  const encryptCredentials = useCallback(async (
    login: string | null,
    password: string | null
  ): Promise<{ login: string | null; password: string | null }> => {
    try {
      const encryptedLogin = login ? await encrypt(login) : null;
      const encryptedPassword = password ? await encrypt(password) : null;
      return { login: encryptedLogin, password: encryptedPassword };
    } catch (error) {
      console.error('Encryption error:', error);
      // Fallback para texto plano se a criptografia falhar
      return { login, password };
    }
  }, [encrypt]);

  // ============= Função de decriptação segura =============
  const safeDecrypt = useCallback(async (value: string | null): Promise<string> => {
    if (!value) return '';
    if (!looksEncrypted(value)) return value;
    try {
      const result = await decrypt(value);
      if (result === value) return value;
      if (looksEncrypted(result)) return value;
      return result;
    } catch {
      return value;
    }
  }, [decrypt]);

  // ============= Decriptação de credenciais de um cliente =============
  const decryptCredentialsForClient = useCallback(async (
    clientId: string,
    encryptedLogin: string | null,
    encryptedPassword: string | null
  ): Promise<{ login: string; password: string }> => {
    if (decryptedCredentials[clientId]) {
      return {
        login: decryptedCredentials[clientId].login,
        password: decryptedCredentials[clientId].password,
      };
    }

    setDecrypting(clientId);
    try {
      const [decryptedLogin, decryptedPassword] = await Promise.all([
        safeDecrypt(encryptedLogin),
        safeDecrypt(encryptedPassword),
      ]);

      const result = { login: decryptedLogin, password: decryptedPassword };
      setDecryptedCredentials(prev => ({ ...prev, [clientId]: result }));
      return result;
    } catch (error) {
      console.error('Decryption error:', error);
      return { login: encryptedLogin || '', password: encryptedPassword || '' };
    } finally {
      setDecrypting(null);
    }
  }, [decrypt, decryptedCredentials, safeDecrypt]);

  // ============= Decriptação em lote para busca =============
  const decryptAllCredentials = useCallback(async (
    clients: ClientWithCredentials[]
  ) => {
    if (allCredentialsDecrypted || isDecryptingAll || !clients.length) return;

    setIsDecryptingAll(true);

    const clientsWithCredentials = clients.filter((c) => {
      const hasAnyCredentials = Boolean(c.login || c.password || c.login_2 || c.password_2);
      if (!hasAnyCredentials) return false;

      const existing = decryptedCredentials[c.id];
      if (!existing) return true;

      // Se credenciais do server 2 existem mas não foram descriptografadas ainda
      const needsSecondServerCredentials =
        Boolean(c.login_2 || c.password_2) &&
        existing.login_2 === undefined &&
        existing.password_2 === undefined;

      return needsSecondServerCredentials;
    });

    if (clientsWithCredentials.length === 0) {
      setAllCredentialsDecrypted(true);
      setIsDecryptingAll(false);
      return;
    }

    // Decriptar em batches para evitar sobrecarregar a API
    const batchSize = 10;
    const newDecrypted: DecryptedCredentials = { ...decryptedCredentials };

    for (let i = 0; i < clientsWithCredentials.length; i += batchSize) {
      const batch = clientsWithCredentials.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (client) => {
          const previous = newDecrypted[client.id] ?? { login: '', password: '' };

          const [decryptedLogin, decryptedPassword, decryptedLogin2, decryptedPassword2] = await Promise.all([
            client.login ? safeDecrypt(client.login) : Promise.resolve(previous.login),
            client.password ? safeDecrypt(client.password) : Promise.resolve(previous.password),
            client.login_2 ? safeDecrypt(client.login_2) : Promise.resolve(previous.login_2 ?? ''),
            client.password_2 ? safeDecrypt(client.password_2) : Promise.resolve(previous.password_2 ?? ''),
          ]);

          newDecrypted[client.id] = {
            ...previous,
            login: decryptedLogin || '',
            password: decryptedPassword || '',
            login_2: decryptedLogin2 || '',
            password_2: decryptedPassword2 || '',
          };
        })
      );
    }

    setDecryptedCredentials(newDecrypted);
    setAllCredentialsDecrypted(true);
    setIsDecryptingAll(false);
  }, [decryptedCredentials, allCredentialsDecrypted, isDecryptingAll, safeDecrypt]);

  // ============= Verificar se precisa decriptar mais =============
  const checkNeedsDecryption = useCallback((clients: ClientWithCredentials[]) => {
    if (clients.length === 0) return;

    const hasClientsNeedingDecryption = clients.some((c) => {
      const hasAnyCredentials = Boolean(c.login || c.password || c.login_2 || c.password_2);
      if (!hasAnyCredentials) return false;

      const existing = decryptedCredentials[c.id];
      if (!existing) return true;

      const needsSecondServerCredentials =
        Boolean(c.login_2 || c.password_2) &&
        existing.login_2 === undefined &&
        existing.password_2 === undefined;

      return needsSecondServerCredentials;
    });

    if (hasClientsNeedingDecryption && allCredentialsDecrypted) {
      setAllCredentialsDecrypted(false);
    }
  }, [decryptedCredentials, allCredentialsDecrypted]);

  // ============= Buscar cliente existente com mesmas credenciais =============
  const findExistingClientWithCredentials = useCallback(async (
    serverId: string,
    plainLogin: string,
    plainPassword: string
  ): Promise<ExistingCredentialsResult | null> => {
    if (!serverId || !plainLogin || !userId) return null;

    // Gerar fingerprint para as credenciais
    const fingerprint = await generateFingerprint(plainLogin, plainPassword);

    // Query direta pelo fingerprint - sem necessidade de decriptação!
    const { data: matchingClients, error } = await supabase
      .from('clients')
      .select('id, login, password, credentials_fingerprint')
      .eq('seller_id', userId)
      .eq('server_id', serverId)
      .eq('is_archived', false)
      .eq('credentials_fingerprint', fingerprint);

    if (error) {
      console.error('Error checking credentials:', error);
      return null;
    }

    if (matchingClients && matchingClients.length > 0) {
      const firstMatch = matchingClients[0];
      return {
        encryptedLogin: firstMatch.login || '',
        encryptedPassword: firstMatch.password || '',
        clientCount: matchingClients.length,
        fingerprint,
      };
    }

    return null;
  }, [userId, generateFingerprint]);

  // ============= Descriptografar logins para busca (todos os clientes) =============
  const decryptSearchLogins = useCallback(async (
    allClientsForSearch: { id: string; login: string | null; login_2: string | null }[]
  ) => {
    if (!userId) return;
    if (allClientsForSearch.length === 0) return;
    if (isDecryptingSearchLogins) return;
    if (searchDecryptInitializedRef.current) return;

    // Carregar cache existente
    const existingCache = loadSearchLoginsCache(userId);
    
    // Verificar quais clientes já estão no cache ou no state
    const missing = allClientsForSearch.filter((c) => 
      !searchDecryptedLogins[c.id] && !existingCache[c.id]
    );
    
    // Se todos já estão cacheados, apenas usar o cache
    if (missing.length === 0) {
      if (Object.keys(existingCache).length > Object.keys(searchDecryptedLogins).length) {
        setSearchDecryptedLogins(existingCache);
      }
      searchDecryptInitializedRef.current = true;
      return;
    }

    searchDecryptInitializedRef.current = true;
    setIsDecryptingSearchLogins(true);
    
    // Iniciar com cache existente
    const next: Record<string, { login: string; login_2: string }> = { 
      ...existingCache, 
      ...searchDecryptedLogins 
    };

    // Descriptografar em batches maiores com allSettled para resiliência
    const batchSize = 50;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (client) => {
          const [login, login_2] = await Promise.all([
            safeDecrypt(client.login ?? null),
            safeDecrypt(client.login_2 ?? null),
          ]);
          return { clientId: client.id, login, login_2 };
        })
      );
      
      // Processar apenas resultados bem-sucedidos
      for (const result of results) {
        if (result.status === 'fulfilled') {
          next[result.value.clientId] = { 
            login: result.value.login, 
            login_2: result.value.login_2 
          };
        }
      }
    }

    // Salvar no state e no cache
    setSearchDecryptedLogins(next);
    saveSearchLoginsCache(userId, next);
    setIsDecryptingSearchLogins(false);
  }, [userId, searchDecryptedLogins, isDecryptingSearchLogins, safeDecrypt]);

  // ============= Limpar credenciais de um cliente específico =============
  const clearClientCredentials = useCallback((clientId: string) => {
    setDecryptedCredentials(prev => {
      const newState = { ...prev };
      delete newState[clientId];
      return newState;
    });
  }, []);

  // ============= Reset quando usuário muda =============
  const resetCredentials = useCallback(() => {
    setDecryptedCredentials({});
    setAllCredentialsDecrypted(false);
    setSearchDecryptedLogins({});
    searchDecryptInitializedRef.current = false;
  }, []);

  // ============= Return =============
  return {
    // Estados
    decryptedCredentials,
    decrypting,
    isDecryptingAll,
    allCredentialsDecrypted,
    searchDecryptedLogins,
    isDecryptingSearchLogins,

    // Funções
    encryptCredentials,
    decryptCredentialsForClient,
    decryptAllCredentials,
    checkNeedsDecryption,
    findExistingClientWithCredentials,
    decryptSearchLogins,
    clearClientCredentials,
    resetCredentials,

    // Helpers
    looksEncrypted,
    safeDecrypt,
  };
}

// Export do helper para uso externo
export { looksEncrypted };
