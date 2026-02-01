import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Plus, Trash2, Mail, Key, CalendarIcon, Sparkles, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, addMonths, addDays, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface PremiumAccount {
  planId: string;
  planName: string;
  email: string;
  password: string;
  price: string;
  expirationDate: string;
  notes: string;
}

interface ClientPremiumAccountsProps {
  sellerId: string;
  onChange?: (accounts: PremiumAccount[]) => void;
  initialAccounts?: PremiumAccount[];
}

export function ClientPremiumAccounts({ sellerId, onChange, initialAccounts = [] }: ClientPremiumAccountsProps) {
  const [localAccounts, setLocalAccounts] = useState<PremiumAccount[]>(initialAccounts);
  const [openCalendars, setOpenCalendars] = useState<Record<number, boolean>>({});

  // Sync with onChange when local accounts change
  useEffect(() => {
    onChange?.(localAccounts);
  }, [localAccounts, onChange]);

  // Initialize from props
  useEffect(() => {
    if (initialAccounts.length > 0) {
      setLocalAccounts(initialAccounts);
    }
  }, []);

  const addAccount = () => {
    setLocalAccounts([...localAccounts, { 
      planId: '', 
      planName: '',
      email: '', 
      password: '', 
      price: '',
      expirationDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      notes: ''
    }]);
  };

  const removeAccount = (index: number) => {
    const newAccounts = localAccounts.filter((_, i) => i !== index);
    setLocalAccounts(newAccounts);
  };

  const updateAccount = (index: number, updates: Partial<PremiumAccount>) => {
    const newAccounts = [...localAccounts];
    newAccounts[index] = { ...newAccounts[index], ...updates };
    setLocalAccounts(newAccounts);
  };


  const setQuickExpiration = (accountIndex: number, type: 'months' | 'years', value: number) => {
    const newDate = type === 'months' 
      ? addMonths(new Date(), value)
      : addYears(new Date(), value);
    updateAccount(accountIndex, { expirationDate: format(newDate, 'yyyy-MM-dd') });
    setOpenCalendars(prev => ({ ...prev, [accountIndex]: false }));
  };

  const copyCredentials = (account: PremiumAccount) => {
    const text = `${account.planName}\nEmail: ${account.email}\nSenha: ${account.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciais copiadas!');
  };

  const totalPrice = localAccounts.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 flex-shrink-0" />
          <h4 className="font-semibold text-amber-600 dark:text-amber-400 text-sm sm:text-base truncate">Contas Premium</h4>
          {localAccounts.length > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {localAccounts.length}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addAccount}
          className="gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Adicionar</span>
          <span className="xs:hidden">+</span>
        </Button>
      </div>

      {localAccounts.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed rounded-lg border-amber-500/30">
          <Sparkles className="h-8 w-8 text-amber-500/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Clique em "Adicionar Conta" para vincular contas premium a este cliente
          </p>
        </div>
      )}

      <div className="space-y-3 sm:space-y-4">
        {localAccounts.map((account, index) => (
          <Card key={index} className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
            <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-amber-600 border-amber-500/50 text-xs">
                  Conta {index + 1}
                </Badge>
                <div className="flex gap-1">
                  {account.email && account.password && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCredentials(account)}
                      className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                    >
                      <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAccount(index)}
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Nome da Conta</Label>
                  <Input
                    value={account.planName}
                    onChange={(e) => updateAccount(index, { planName: e.target.value })}
                    placeholder="Ex: Netflix, Spotify, Disney+..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={account.price}
                    onChange={(e) => updateAccount(index, { price: e.target.value })}
                    placeholder="Ex: 15.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email da Conta
                  </Label>
                  <Input
                    type="email"
                    value={account.email}
                    onChange={(e) => updateAccount(index, { email: e.target.value })}
                    placeholder="email@premium.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    Senha da Conta
                  </Label>
                  <Input
                    value={account.password}
                    onChange={(e) => updateAccount(index, { password: e.target.value })}
                    placeholder="Senha"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    Vencimento
                  </Label>
                  <Popover 
                    open={openCalendars[index]} 
                    onOpenChange={(open) => setOpenCalendars(prev => ({ ...prev, [index]: open }))}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !account.expirationDate && "text-muted-foreground"
                        )}
                        type="button"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {account.expirationDate 
                          ? format(new Date(account.expirationDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                          : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-2 border-b space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickExpiration(index, 'months', 1)}
                            className="text-xs"
                          >
                            1 mês
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickExpiration(index, 'months', 3)}
                            className="text-xs"
                          >
                            3 meses
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickExpiration(index, 'months', 6)}
                            className="text-xs"
                          >
                            6 meses
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickExpiration(index, 'years', 1)}
                            className="text-xs"
                          >
                            1 ano
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[2027, 2028, 2029, 2030].map(year => (
                            <Button
                              key={year}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const currentDate = account.expirationDate 
                                  ? new Date(account.expirationDate + 'T12:00:00')
                                  : new Date();
                                const newDate = new Date(year, currentDate.getMonth(), currentDate.getDate());
                                updateAccount(index, { expirationDate: format(newDate, 'yyyy-MM-dd') });
                                setOpenCalendars(prev => ({ ...prev, [index]: false }));
                              }}
                              className="text-xs text-muted-foreground"
                            >
                              {year}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <Calendar
                        mode="single"
                        selected={account.expirationDate ? new Date(account.expirationDate + 'T12:00:00') : undefined}
                        onSelect={(date) => {
                          if (date) {
                            updateAccount(index, { expirationDate: format(date, 'yyyy-MM-dd') });
                            setOpenCalendars(prev => ({ ...prev, [index]: false }));
                          }
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Observações (opcional)</Label>
                  <Input
                    value={account.notes}
                    onChange={(e) => updateAccount(index, { notes: e.target.value })}
                    placeholder="Ex: Perfil 3, tela extra..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {localAccounts.length > 0 && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Valor Total das Contas Premium:</span>
            <span className="text-lg font-bold text-primary">
              R$ {totalPrice.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Display component for showing premium accounts in client cards
interface ClientPremiumAccountsDisplayProps {
  accounts: PremiumAccount[];
  isPrivacyMode?: boolean;
  maskData?: (data: string) => string;
}

export function ClientPremiumAccountsDisplay({ accounts, isPrivacyMode, maskData }: ClientPremiumAccountsDisplayProps) {
  const displayValue = (value: string) => {
    if (isPrivacyMode && maskData) {
      return maskData(value);
    }
    return value;
  };

  const copyCredentials = (account: PremiumAccount) => {
    const text = `${account.planName}\nEmail: ${account.email}\nSenha: ${account.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciais copiadas!');
  };

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Contas Premium ({accounts.length})</span>
      </div>
      <div className="space-y-2">
        {accounts.map((account, index) => (
          <div 
            key={index} 
            className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs space-y-1"
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
                    onClick={() => copyCredentials(account)}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span>{displayValue(account.email)}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Key className="h-3 w-3" />
              <span>{displayValue(account.password)}</span>
            </div>
            {account.expirationDate && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                <span>Vence: {format(new Date(account.expirationDate + 'T12:00:00'), 'dd/MM/yyyy')}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
