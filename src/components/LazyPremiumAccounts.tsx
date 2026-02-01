import { useState, memo, forwardRef, useCallback } from 'react';
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
 * 
 * This component controls the data fetching, while LazyAccountsDisplay
 * handles all the UI rendering (expand/collapse, display, etc.)
 */
const LazyPremiumAccountsComponent = forwardRef<HTMLDivElement, LazyPremiumAccountsProps>(
  function LazyPremiumAccounts({ clientId, sellerId, isPrivacyMode = false, maskData }, ref) {
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
        return (data || []).map((acc) => ({
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

    // Stable callback to trigger data fetch when user expands
    const handleExpandChange = useCallback((expanded: boolean) => {
      if (expanded && !shouldFetch) {
        setShouldFetch(true);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Don't render anything if no accounts
    if (accountCount === 0) return null;

    return (
      <div ref={ref}>
        <LazyAccountsDisplay
          accounts={shouldFetch ? accounts : []}
          isPrivacyMode={isPrivacyMode}
          maskData={maskData}
          title={`Contas Premium (${accountCount})`}
          isLoading={isLoading && shouldFetch}
          onExpandChange={handleExpandChange}
        />
      </div>
    );
  }
);

export const LazyPremiumAccounts = memo(LazyPremiumAccountsComponent);
export default LazyPremiumAccounts;
