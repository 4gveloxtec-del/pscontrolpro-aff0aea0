import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface TrialApiStatus {
  isInTrial: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
  apiAllowedInTrial: boolean;
  apiHoursLimit: number;
  apiStartedAt: Date | null;
  apiHoursRemaining: number | null;
  apiBlocked: boolean;
  blockReason: string | null;
  isPermanent: boolean;
  hasPaidPlan: boolean;
}

export function useTrialApiStatus() {
  const { user, profile, isAdmin } = useAuth();
  const [status, setStatus] = useState<TrialApiStatus>({
    isInTrial: false,
    trialEndsAt: null,
    trialDaysRemaining: 0,
    apiAllowedInTrial: false,
    apiHoursLimit: 24,
    apiStartedAt: null,
    apiHoursRemaining: null,
    apiBlocked: true,
    blockReason: null,
    isPermanent: false,
    hasPaidPlan: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    if (!user || !profile) {
      setIsLoading(false);
      return;
    }

    // Admins always have full access
    if (isAdmin) {
      setStatus({
        isInTrial: false,
        trialEndsAt: null,
        trialDaysRemaining: 0,
        apiAllowedInTrial: true,
        apiHoursLimit: 0,
        apiStartedAt: null,
        apiHoursRemaining: null,
        apiBlocked: false,
        blockReason: null,
        isPermanent: true,
        hasPaidPlan: true,
      });
      setIsLoading(false);
      return;
    }

    try {
      // Fetch trial settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['trial_api_enabled', 'trial_api_hours']);

      const trialApiEnabled = settings?.find(s => s.key === 'trial_api_enabled')?.value === 'true';
      const trialApiHours = parseInt(settings?.find(s => s.key === 'trial_api_hours')?.value || '24', 10);

      // Get profile with api_trial_started_at
      const { data: fullProfile } = await supabase
        .from('profiles')
        .select('is_permanent, subscription_expires_at, created_at, api_trial_started_at')
        .eq('id', user.id)
        .maybeSingle();

      if (!fullProfile) {
        setIsLoading(false);
        return;
      }

      const now = new Date();
      const isPermanent = fullProfile.is_permanent === true;
      
      // Check if user has a paid plan
      let hasPaidPlan = false;
      if (isPermanent) {
        hasPaidPlan = true;
      } else if (fullProfile.subscription_expires_at) {
        const expiresAt = new Date(fullProfile.subscription_expires_at);
        hasPaidPlan = expiresAt > now;
      }

      // Determine trial status
      const isInTrial = !isPermanent && !hasPaidPlan;
      let trialEndsAt: Date | null = null;
      let trialDaysRemaining = 0;

      if (isInTrial && fullProfile.subscription_expires_at) {
        trialEndsAt = new Date(fullProfile.subscription_expires_at);
        trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      // Calculate API hours remaining
      let apiStartedAt: Date | null = null;
      let apiHoursRemaining: number | null = null;
      let apiBlocked = true;
      let blockReason: string | null = null;

      if (isPermanent || hasPaidPlan) {
        // Paid users have full API access
        apiBlocked = false;
      } else if (isInTrial) {
        if (!trialApiEnabled) {
          apiBlocked = true;
          blockReason = 'WhatsApp API não disponível durante o período de teste. Ative seu plano para desbloquear.';
        } else if (trialDaysRemaining <= 0) {
          apiBlocked = true;
          blockReason = 'Período de teste expirado. Ative seu plano para continuar usando a API.';
        } else if (fullProfile.api_trial_started_at) {
          apiStartedAt = new Date(fullProfile.api_trial_started_at);
          const hoursUsed = (now.getTime() - apiStartedAt.getTime()) / (1000 * 60 * 60);
          apiHoursRemaining = Math.max(0, trialApiHours - hoursUsed);
          
          if (apiHoursRemaining <= 0) {
            apiBlocked = true;
            blockReason = `Tempo de uso da API esgotado (${trialApiHours}h). Ative seu plano para continuar.`;
          } else {
            apiBlocked = false;
          }
        } else {
          // API not started yet, but allowed
          apiBlocked = false;
          apiHoursRemaining = trialApiHours;
        }
      }

      setStatus({
        isInTrial,
        trialEndsAt,
        trialDaysRemaining,
        apiAllowedInTrial: trialApiEnabled,
        apiHoursLimit: trialApiHours,
        apiStartedAt,
        apiHoursRemaining,
        apiBlocked,
        blockReason,
        isPermanent,
        hasPaidPlan,
      });
    } catch (error) {
      console.error('Error checking trial API status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, profile, isAdmin]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Start API trial timer
  const startApiTrial = useCallback(async () => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ api_trial_started_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;
      
      await checkStatus();
      return true;
    } catch (error) {
      console.error('Error starting API trial:', error);
      return false;
    }
  }, [user, checkStatus]);

  return {
    ...status,
    isLoading,
    refetch: checkStatus,
    startApiTrial,
  };
}
