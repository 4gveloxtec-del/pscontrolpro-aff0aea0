import { supabase } from '@/integrations/supabase/client';

interface BruteForceHook {
  checkLoginAttempt: (email: string) => Promise<{ isBlocked: boolean; remainingAttempts: number }>;
  recordLoginAttempt: (email: string, success: boolean) => Promise<void>;
}

const MAX_ATTEMPTS = 10;
const BLOCK_DURATION_MINUTES = 15;

export function useBruteForce(): BruteForceHook {
  const checkLoginAttempt = async (email: string): Promise<{ isBlocked: boolean; remainingAttempts: number }> => {
    try {
      // Calculate timestamp for 15 minutes ago
      const fifteenMinutesAgo = new Date(Date.now() - BLOCK_DURATION_MINUTES * 60 * 1000).toISOString();
      
      // Count failed attempts in the last 15 minutes
      const { count, error } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('email', email)
        .eq('success', false)
        .gte('attempt_at', fifteenMinutesAgo);

      if (error) {
        console.error('Check login attempt error:', error);
        // On error, allow login attempt (fail-open)
        return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS };
      }

      const failedAttempts = count || 0;
      const isBlocked = failedAttempts >= MAX_ATTEMPTS;
      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - failedAttempts);

      return { isBlocked, remainingAttempts };
    } catch (err) {
      console.error('Check login attempt error:', err);
      return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS };
    }
  };

  const recordLoginAttempt = async (email: string, success: boolean): Promise<void> => {
    try {
      if (success) {
        // On successful login, delete old failed attempts for this email
        await supabase
          .from('login_attempts')
          .delete()
          .eq('email', email)
          .eq('success', false);
      } else {
        // Record failed attempt
        await supabase
          .from('login_attempts')
          .insert({
            email,
            success: false,
          });
      }
    } catch (err) {
      console.error('Record login attempt error:', err);
    }
  };

  return { checkLoginAttempt, recordLoginAttempt };
}
