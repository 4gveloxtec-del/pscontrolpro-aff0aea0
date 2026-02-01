import { useState, memo, forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { LazyAccountsDisplay } from '@/components/LazyAccountsDisplay';
import { PremiumAccount } from '@/components/ClientPremiumAccounts';
import { ChevronDown, ChevronUp, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
const LazyPremiumAccountsComponent = forwardRef<HTMLDivElement, LazyPremiumAccountsProps>(
  function LazyPremiumAccounts({ clientId, sellerId, isPrivacyMode = false, maskData }, ref) {
    const [isExpanded, setIsExpanded] = useState(false);

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

    // Only fetch full data when expanded (user clicked to expand)
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
      enabled: isExpanded && accountCount > 0,
      staleTime: 30000, // 30 seconds cache
    });

    // Don't render anything if no accounts
    if (accountCount === 0) return null;

    const handleToggle = () => {
      setIsExpanded(!isExpanded);
    };

    return (
      <div ref={ref} className="w-full">
        {/* Collapsed header - always visible */}
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Contas Premium</span>
            <Badge variant="secondary" className="text-xs">
              {accountCount}
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="animate-pulse text-xs text-muted-foreground">
                  Carregando contas...
                </div>
              </div>
            ) : (
              <LazyAccountsDisplay
                accounts={accounts}
                isPrivacyMode={isPrivacyMode}
                maskData={maskData}
              />
            )}
          </div>
        )}
      </div>
    );
  }
);

export const LazyPremiumAccounts = memo(LazyPremiumAccountsComponent);
export default LazyPremiumAccounts;
