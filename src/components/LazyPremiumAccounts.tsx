import { useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { LazyAccountsDisplay } from '@/components/LazyAccountsDisplay';
import { PremiumAccount } from '@/components/ClientPremiumAccounts';

interface LazyPremiumAccountsProps {
  clientId: string;
  sellerId: string;
  isPrivacyMode?: boolean;
  maskData?: (data: string, type?: string) => string;
}

/**
 * Lazy loading component for client premium accounts
 * Only fetches data when the user expands the section
 */
export const LazyPremiumAccounts = memo(function LazyPremiumAccounts({
  clientId,
  sellerId,
  isPrivacyMode = false,
  maskData,
}: LazyPremiumAccountsProps) {
  const [shouldFetch, setShouldFetch] = useState(false);

  // Query to check if client has premium accounts (just count)
  const { data: accountCount = 0 } = useQuery({
    queryKey: ['client-premium-accounts-count', clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('client_premium_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('seller_id', sellerId);
      
      if (error) throw error;
      return count || 0;
    },
    staleTime: 60000, // 1 minute cache
    gcTime: 300000, // 5 minutes garbage collection
  });

  // Only fetch full data when shouldFetch is true (user clicked to expand)
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['client-premium-accounts', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_premium_accounts')
        .select('*')
        .eq('client_id', clientId)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform to PremiumAccount format
      return (data || []).map(acc => ({
        planId: acc.id,
        planName: acc.plan_name,
        email: acc.email || '',
        password: acc.password || '',
        price: acc.price?.toString() || '0',
        expirationDate: acc.expiration_date || '',
        notes: acc.notes || '',
      })) as PremiumAccount[];
    },
    enabled: shouldFetch && accountCount > 0,
    staleTime: 30000, // 30 seconds cache
  });

  // Don't render anything if no accounts
  if (accountCount === 0) return null;

  // If not fetched yet, show collapsed preview
  if (!shouldFetch) {
    return (
      <LazyAccountsDisplay
        accounts={[]}
        isPrivacyMode={isPrivacyMode}
        maskData={maskData}
        title={`Contas Premium (${accountCount})`}
        maxPreview={0}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="animate-pulse text-xs text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <LazyAccountsDisplay
      accounts={accounts}
      isPrivacyMode={isPrivacyMode}
      maskData={maskData}
    />
  );
});

export default LazyPremiumAccounts;
