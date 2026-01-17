import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingStatus {
  hasServers: boolean;
  hasPlans: boolean;
  hasClients: boolean;
  loading: boolean;
}

export function useOnboardingCheck() {
  const { user, isSeller, isAdmin, profile } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus>({
    hasServers: true,
    hasPlans: true,
    hasClients: true,
    loading: true,
  });

  useEffect(() => {
    if (user && isSeller && !isAdmin) {
      checkStatus();
    } else {
      // Admins skip onboarding checks
      setStatus({
        hasServers: true,
        hasPlans: true,
        hasClients: true,
        loading: false,
      });
    }
  }, [user, isSeller, isAdmin]);

  const checkStatus = async () => {
    if (!user) return;

    try {
      const [serversRes, plansRes, clientsRes] = await Promise.all([
        supabase.from('servers').select('id').eq('seller_id', user.id).limit(1),
        supabase.from('plans').select('id').eq('seller_id', user.id).limit(1),
        supabase.from('clients').select('id').eq('seller_id', user.id).limit(1),
      ]);

      setStatus({
        hasServers: (serversRes.data?.length || 0) > 0,
        hasPlans: (plansRes.data?.length || 0) > 0,
        hasClients: (clientsRes.data?.length || 0) > 0,
        loading: false,
      });
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  const refreshStatus = () => {
    if (user && isSeller && !isAdmin) {
      checkStatus();
    }
  };

  // Check if user needs to complete onboarding
  const needsOnboarding = isSeller && !isAdmin && profile?.tutorial_visto === false;

  // Check if a specific route is accessible
  const canAccessRoute = (route: string): boolean => {
    // Admins can access everything
    if (isAdmin || !needsOnboarding) return true;
    
    // If still loading, allow access temporarily
    if (status.loading) return true;

    switch (route) {
      case '/servers':
        return true; // Always accessible
      case '/plans':
        return status.hasServers; // Need servers first
      case '/clients':
        return status.hasServers && status.hasPlans; // Need servers and plans
      default:
        return true;
    }
  };

  // Get the next required step
  const getNextStep = (): string | null => {
    if (!needsOnboarding) return null;
    if (!status.hasServers) return '/servers';
    if (!status.hasPlans) return '/plans';
    if (!status.hasClients) return '/clients';
    return null;
  };

  return {
    ...status,
    needsOnboarding,
    canAccessRoute,
    getNextStep,
    refreshStatus,
  };
}
