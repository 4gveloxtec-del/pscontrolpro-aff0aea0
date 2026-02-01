import { useState, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Eye, EyeOff, Sparkles, Mail, Key, CalendarIcon, Copy, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { PremiumAccount } from '@/components/ClientPremiumAccounts';

interface LazyAccountsDisplayProps {
  accounts: PremiumAccount[];
  isPrivacyMode?: boolean;
  maskData?: (data: string, type?: string) => string;
  title?: string;
  maxPreview?: number;
  isLoading?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

/**
 * Lazy loading component for premium accounts
 * Only shows accounts when user clicks to expand
 */
export const LazyAccountsDisplay = memo(function LazyAccountsDisplay({
  accounts,
  isPrivacyMode = false,
  maskData = (d) => d,
  title = 'Contas Premium',
  maxPreview = 0,
  isLoading = false,
  onExpandChange,
}: LazyAccountsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  // Notify parent when expand state changes
  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  // Extract count from title if present, otherwise use accounts length
  const countMatch = title.match(/\((\d+)\)/);
  const displayCount = countMatch ? parseInt(countMatch[1]) : accounts.length;

  // Don't render if no accounts and no count in title
  if (accounts.length === 0 && displayCount === 0) return null;

  const displayValue = (value: string, type?: string) => {
    if (isPrivacyMode) {
      return maskData(value, type);
    }
    if (!showPasswords && type === 'password') {
      return '••••••••';
    }
    return value;
  };

  const copyCredentials = (account: PremiumAccount) => {
    const text = `${account.planName}\nEmail: ${account.email}\nSenha: ${account.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciais copiadas!');
  };

  const totalPrice = accounts.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0);

  // Clean title (remove count if present since we show badge separately)
  const cleanTitle = title.replace(/\s*\(\d+\)/, '');

  return (
    <div className="space-y-2">
      {/* Header - Always visible */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between h-auto py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {cleanTitle}
          </span>
          <Badge variant="secondary" className="text-xs">
            {displayCount}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <span className="text-sm font-bold text-primary">
              R$ {totalPrice.toFixed(2)}
            </span>
          )}
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </Button>

      {/* Expandable content - Only rendered when expanded */}
      {isExpanded && (
        <Card className="border-amber-500/30">
          <CardContent className="p-3 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500 mr-2" />
                <span className="text-sm text-muted-foreground">Carregando contas...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Nenhuma conta encontrada
              </div>
            ) : (
              <>
                {/* Toggle password visibility */}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="text-xs gap-1"
                  >
                    {showPasswords ? (
                      <>
                        <EyeOff className="h-3 w-3" />
                        Ocultar senhas
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        Mostrar senhas
                      </>
                    )}
                  </Button>
                </div>

                {/* Account list */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {accounts.map((account, index) => (
                    <div
                      key={index}
                      className="p-2 rounded bg-amber-500/5 border border-amber-500/10 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-amber-600 border-amber-500/50 text-xs">
                          {account.planName || 'Conta Premium'}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">R$ {account.price}</span>
                          {!isPrivacyMode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyCredentials(account);
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{displayValue(account.email, 'email')}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Key className="h-3 w-3" />
                        <span>{displayValue(account.password, 'password')}</span>
                      </div>
                      {account.expirationDate && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CalendarIcon className="h-3 w-3" />
                          <span>
                            Vence: {format(new Date(account.expirationDate + 'T12:00:00'), 'dd/MM/yyyy')}
                          </span>
                        </div>
                      )}
                      {account.notes && (
                        <div className="text-muted-foreground italic">
                          {account.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});

export default LazyAccountsDisplay;
