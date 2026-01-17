import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FingerprintHook {
  generateFingerprint: (login: string, password: string) => Promise<string>;
}

export function useFingerprint(): FingerprintHook {
  const generateFingerprint = useCallback(async (login: string, password: string): Promise<string> => {
    if (!login) return '';

    try {
      const { data, error } = await supabase.functions.invoke('generate-fingerprint', {
        body: { login, password: password || '' },
      });

      if (error) {
        console.error('Fingerprint generation error:', error);
        throw new Error('Failed to generate fingerprint');
      }

      return data.fingerprint;
    } catch (err) {
      console.error('Fingerprint generation error:', err);
      throw err;
    }
  }, []);

  return { generateFingerprint };
}
