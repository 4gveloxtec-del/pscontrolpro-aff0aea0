import { supabaseExternal as supabase } from '@/lib/supabase-external';

interface BruteForceHook {
  checkLoginAttempt: (email: string) => Promise<{ isBlocked: boolean; remainingAttempts: number }>;
  recordLoginAttempt: (email: string, success: boolean) => Promise<void>;
}

export function useBruteForce(): BruteForceHook {
  const checkLoginAttempt = async (email: string): Promise<{ isBlocked: boolean; remainingAttempts: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-login-attempt', {
        body: { action: 'check', email }
      });

      if (error) {
        console.error('Check login attempt error:', error);
        return { isBlocked: false, remainingAttempts: 10 };
      }

      return {
        isBlocked: data.isBlocked,
        remainingAttempts: data.remainingAttempts
      };
    } catch (err) {
      console.error('Check login attempt error:', err);
      return { isBlocked: false, remainingAttempts: 10 };
    }
  };

  const recordLoginAttempt = async (email: string, success: boolean): Promise<void> => {
    try {
      await supabase.functions.invoke('check-login-attempt', {
        body: { action: 'record', email, success }
      });
    } catch (err) {
      console.error('Record login attempt error:', err);
    }
  };

  return { checkLoginAttempt, recordLoginAttempt };
}
