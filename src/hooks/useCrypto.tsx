import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CryptoHook {
  encrypt: (plaintext: string) => Promise<string>;
  decrypt: (ciphertext: string) => Promise<string>;
}

async function getAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');
  return { Authorization: `Bearer ${token}` };
}

export function useCrypto(): CryptoHook {
  const encrypt = useCallback(async (plaintext: string): Promise<string> => {
    if (!plaintext) return '';

    try {
      const { data, error } = await supabase.functions.invoke('crypto', {
        headers: await getAuthHeaders(),
        body: { action: 'encrypt', data: plaintext },
      });

      if (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
      }

      return data.result;
    } catch (err) {
      console.error('Encryption error:', err);
      throw err;
    }
  }, []);

  const decrypt = useCallback(async (ciphertext: string): Promise<string> => {
    if (!ciphertext) return '';

    try {
      const { data, error } = await supabase.functions.invoke('crypto', {
        headers: await getAuthHeaders(),
        body: { action: 'decrypt', data: ciphertext },
      });

      if (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
      }

      return data.result;
    } catch (err) {
      console.error('Decryption error:', err);
      throw err;
    }
  }, []);

  return { encrypt, decrypt };
}

