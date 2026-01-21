import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { X, Bell, Clock, AlertTriangle, MessageCircle, ChevronDown, Calendar, Repeat, AppWindow, UserX, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays, startOfToday, format, getDate, addMonths, setDate, isBefore, isAfter } from 'date-fns';
import { Link } from 'react-router-dom';

const PUSH_SUBSCRIPTION_STORAGE = 'push_subscription_active';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  expiration_date: string;
  plan_name: string | null;
  created_at: string | null;
}

interface Plan {
  id: string;
  duration_days: number;
}

interface ExternalAppExpiring {
  clientName: string;
  clientPhone: string | null;
  appName: string;
  daysRemaining: number;
  expirationDate: string;
}

interface AnnualClientReminder {
  client: Client;
  nextBillingDate: Date;
  daysUntilBilling: number;
  isAnnual: true;
  isExternalApp: false;
}

interface ExpiringClient {
  client: Client;
  daysRemaining: number;
  isAnnual: false;
  isExternalApp: false;
}

interface ExpiringExternalApp {
  appInfo: ExternalAppExpiring;
  isExternalApp: true;
  isAnnual: false;
}

interface SellerSubscriptionWarning {
  daysRemaining: number;
  expirationDate: string;
  isSellerWarning: true;
  isExternalApp: false;
  isAnnual: false;
  isPendingPayment: false;
}

interface PendingPaymentClient {
  id: string;
  name: string;
  phone: string | null;
  pending_amount: number;
  expected_payment_date: string;
  daysRemaining: number;
  isPendingPayment: true;
  isExternalApp: false;
  isAnnual: false;
}

type NotificationItem = AnnualClientReminder | ExpiringClient | ExpiringExternalApp | SellerSubscriptionWarning | PendingPaymentClient;

export function FloatingNotifications() {
  const { user, isSeller, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(true);
  
  // Check if push notifications are enabled
  const isPushEnabled = localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE) === 'true';

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, expiration_date, plan_name, created_at')
        .eq('seller_id', user.id)
        .eq('is_archived', false);
      if (error) throw error;
      return data as Client[] || [];
    },
    enabled: !!user?.id && isSeller,
    refetchInterval: 60000,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans-for-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('plans')
        .select('id, duration_days');
      if (error) throw error;
      return data as Plan[] || [];
    },
    enabled: !!user?.id && isSeller,
  });

  // Fetch external apps expiring soon (0-30 days)
  const { data: expiringExternalApps = [] } = useQuery({
    queryKey: ['expiring-external-apps', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`
          expiration_date,
          client:clients(name, phone),
          external_app:external_apps(name)
        `)
        .eq('seller_id', user.id)
        .not('expiration_date', 'is', null);
      if (error) throw error;
      
      const today = startOfToday();
      const result: ExternalAppExpiring[] = [];
      
      for (const item of data || []) {
        if (!item.expiration_date || !item.client || !item.external_app) continue;
        const clientData = item.client as unknown as { name: string; phone: string | null };
        const appData = item.external_app as unknown as { name: string };
        const daysRemaining = differenceInDays(new Date(item.expiration_date), today);
        
        // Show apps expiring within 30 days
        if (daysRemaining >= 0 && daysRemaining <= 30) {
          result.push({
            clientName: clientData.name,
            clientPhone: clientData.phone,
            appName: appData.name,
            daysRemaining,
            expirationDate: item.expiration_date,
          });
        }
      }
      
      return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
    },
    enabled: !!user?.id && isSeller,
    refetchInterval: 60000,
  });

  // Fetch clients with pending payments
  const { data: pendingPaymentClients = [] } = useQuery({
    queryKey: ['pending-payments-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, pending_amount, expected_payment_date')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', false)
        .gt('pending_amount', 0)
        .not('expected_payment_date', 'is', null);
      if (error) throw error;
      
      const todayDate = startOfToday();
      const result: PendingPaymentClient[] = [];
      const seen = new Set<string>();
      
      for (const client of data || []) {
        if (!client.expected_payment_date || !client.pending_amount) continue;
        const daysRemaining = differenceInDays(new Date(client.expected_payment_date), todayDate);
        
        // Show payments due today, tomorrow, or overdue (within -7 days)
        if (daysRemaining <= 1 && daysRemaining >= -7) {
          const key = client.phone ? `phone:${String(client.phone).trim()}` : `id:${client.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            id: client.id,
            name: client.name,
            phone: client.phone,
            pending_amount: client.pending_amount,
            expected_payment_date: client.expected_payment_date,
            daysRemaining,
            isPendingPayment: true as const,
            isExternalApp: false as const,
            isAnnual: false as const
          });
        }
      }
      
      return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
    },
    enabled: !!user?.id && isSeller,
    refetchInterval: 60000,
  });

  const today = startOfToday();

  // Calculate monthly billing date for annual clients
  const getNextMonthlyBillingDate = (client: Client): Date | null => {
    // Use created_at as the reference for monthly billing
    if (!client.created_at) return null;
    
    const createdDate = new Date(client.created_at);
    const billingDay = getDate(createdDate); // Day of month when client was created
    
    // Find the next billing date
    let nextBilling = setDate(today, billingDay);
    
    // If today is after the billing day this month, get next month
    if (isBefore(nextBilling, today) || getDate(today) > billingDay) {
      nextBilling = addMonths(nextBilling, 1);
    }
    
    // Make sure billing date doesn't exceed expiration
    const expiration = new Date(client.expiration_date);
    if (isAfter(nextBilling, expiration)) {
      return null;
    }
    
    return nextBilling;
  };

  // Check if client has annual plan (365 days)
  const isAnnualPlan = (planName: string | null): boolean => {
    if (!planName) return false;
    const lowerName = planName.toLowerCase();
    return lowerName.includes('anual') || lowerName.includes('365');
  };

  // Get urgent clients (0-3 days to expire)
  const urgentClients: ExpiringClient[] = clients
    .filter(c => !isAnnualPlan(c.plan_name)) // Exclude annual clients from regular expiring
    .map(c => ({
      client: c,
      daysRemaining: differenceInDays(new Date(c.expiration_date), today),
      isAnnual: false as const,
      isExternalApp: false as const
    }))
    .filter(c => c.daysRemaining >= 0 && c.daysRemaining <= 3)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Get annual clients with monthly billing reminder (1 day before)
  const annualClientReminders: AnnualClientReminder[] = clients
    .filter(c => isAnnualPlan(c.plan_name))
    .map(c => {
      const nextBilling = getNextMonthlyBillingDate(c);
      if (!nextBilling) return null;
      
      const daysUntilBilling = differenceInDays(nextBilling, today);
      
      // Only show if billing is in 1 day (tomorrow)
      if (daysUntilBilling === 1) {
        return {
          client: c,
          nextBillingDate: nextBilling,
          daysUntilBilling,
          isAnnual: true as const,
          isExternalApp: false as const
        };
      }
      return null;
    })
    .filter((item): item is AnnualClientReminder => item !== null);

  // Convert external apps expiring to notification items
  const externalAppNotifications: ExpiringExternalApp[] = expiringExternalApps.map(app => ({
    appInfo: app,
    isExternalApp: true as const,
    isAnnual: false as const
  }));

  // Seller subscription warning (only show if push is NOT enabled)
  const sellerSubscriptionWarning: SellerSubscriptionWarning | null = (() => {
    if (!isSeller || !profile?.subscription_expires_at || profile?.is_permanent) return null;
    if (isPushEnabled) return null; // Don't show in-app if push is enabled
    
    const expirationDate = new Date(profile.subscription_expires_at);
    const daysRemaining = differenceInDays(expirationDate, today);
    
    if (daysRemaining >= 0 && daysRemaining <= 3) {
      return {
        daysRemaining,
        expirationDate: profile.subscription_expires_at,
        isSellerWarning: true as const,
        isExternalApp: false as const,
        isAnnual: false as const,
        isPendingPayment: false as const
      };
    }
    return null;
  })();

  const allNotifications: NotificationItem[] = [
    ...(sellerSubscriptionWarning ? [sellerSubscriptionWarning] : []), // Seller warning first
    ...pendingPaymentClients, // Pending payments (urgent!)
    ...annualClientReminders, // Annual reminders
    ...externalAppNotifications, // External apps expiring
    ...urgentClients
  ];

  const totalUrgent = allNotifications.length;

  useEffect(() => {
    if (totalUrgent > 0) {
      setHasNewNotifications(true);
    }
  }, [totalUrgent]);

  if (!isSeller || totalUrgent === 0 || isDismissed) {
    return null;
  }

  const getDayLabel = (days: number, isAnnual: boolean = false, isPendingPayment: boolean = false) => {
    if (isPendingPayment) {
      if (days < 0) return 'ATRASADO';
      if (days === 0) return 'HOJE';
      if (days === 1) return 'Amanhã';
      return `${days}d`;
    }
    if (isAnnual) return 'Cobrança';
    if (days === 0) return 'HOJE';
    if (days === 1) return 'Amanhã';
    return `${days} dias`;
  };

  const getDayColor = (days: number, isAnnual: boolean = false) => {
    if (isAnnual) return 'text-primary bg-primary/20';
    if (days === 0) return 'text-destructive bg-destructive/20';
    if (days === 1) return 'text-destructive/80 bg-destructive/10';
    if (days === 2) return 'text-warning bg-warning/20';
    return 'text-warning/70 bg-warning/10';
  };

  const openWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    window.open(`https://wa.me/${formattedPhone}`, '_blank');
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-6">
      {/* Notification Badge Button */}
      {!isOpen && (
        <Button
          onClick={() => {
            setIsOpen(true);
            setHasNewNotifications(false);
          }}
          className={cn(
            "relative h-14 w-14 rounded-full shadow-lg",
            "bg-warning hover:bg-warning/90 text-warning-foreground",
            hasNewNotifications && "animate-bounce"
          )}
        >
          <Bell className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
            {totalUrgent}
          </span>
          {hasNewNotifications && (
            <span className="absolute -top-1 -right-1 flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            </span>
          )}
        </Button>
      )}

      {/* Notification Panel */}
      {isOpen && (
        <div className="w-80 max-h-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-warning/20 to-destructive/20 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-warning" />
              <span className="font-semibold text-sm">Lembretes</span>
              <Badge variant="destructive" className="text-xs">{totalUrgent}</Badge>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-72 overflow-y-auto">
            {allNotifications.slice(0, 10).map((item, index) => {
              // Handle seller subscription warning
              if ('isSellerWarning' in item && item.isSellerWarning) {
                const sellerItem = item as SellerSubscriptionWarning;
                return (
                  <div
                    key="seller-subscription-warning"
                    className="px-4 py-3 flex items-center gap-3 bg-destructive/10 border-b border-border/50"
                  >
                    {/* Day Badge */}
                    <div className={cn(
                      "flex-shrink-0 w-14 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold",
                      sellerItem.daysRemaining === 0 ? "text-destructive bg-destructive/20" :
                      sellerItem.daysRemaining === 1 ? "text-destructive/80 bg-destructive/15" :
                      "text-warning bg-warning/20"
                    )}>
                      <UserX className="h-4 w-4" />
                      <span className="text-[10px]">{getDayLabel(sellerItem.daysRemaining)}</span>
                    </div>

                    {/* Warning Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-destructive">Sua Assinatura</p>
                      <p className="text-xs text-muted-foreground">
                        {sellerItem.daysRemaining === 0 
                          ? 'Vence HOJE! Renove agora.'
                          : sellerItem.daysRemaining === 1 
                          ? 'Vence amanhã! Renove para não perder acesso.'
                          : `Vence em ${sellerItem.daysRemaining} dias. Renove para continuar.`
                        }
                      </p>
                    </div>

                    {/* Settings Link */}
                    <Link to="/settings" onClick={() => setIsOpen(false)}>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                      >
                        Renovar
                      </Button>
                    </Link>
                  </div>
                );
              }
              
              // Handle pending payment notifications
              if ('isPendingPayment' in item && item.isPendingPayment) {
                const paymentItem = item as PendingPaymentClient;
                return (
                  <div
                    key={`payment-${paymentItem.id}`}
                    className={cn(
                      "px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0",
                      paymentItem.daysRemaining < 0 ? "bg-red-500/10" : "bg-emerald-500/5"
                    )}
                  >
                    {/* Day Badge */}
                    <div className={cn(
                      "flex-shrink-0 w-14 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold",
                      paymentItem.daysRemaining < 0 
                        ? "text-red-600 bg-red-500/20" 
                        : paymentItem.daysRemaining === 0 
                        ? "text-amber-600 bg-amber-500/20"
                        : "text-emerald-600 bg-emerald-500/20"
                    )}>
                      <DollarSign className="h-4 w-4" />
                      <span className="text-[10px]">{getDayLabel(paymentItem.daysRemaining, false, true)}</span>
                    </div>

                    {/* Payment Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{paymentItem.name}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        R$ {paymentItem.pending_amount.toFixed(2)}
                        {paymentItem.daysRemaining < 0 && (
                          <span className="text-red-500 ml-1">
                            ({Math.abs(paymentItem.daysRemaining)}d atrasado)
                          </span>
                        )}
                      </p>
                    </div>

                    {/* WhatsApp Button */}
                    {paymentItem.phone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10 flex-shrink-0"
                        onClick={() => openWhatsApp(paymentItem.phone!, paymentItem.name)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }
              
              // Handle external app notifications
              if (item.isExternalApp) {
                const appItem = item as ExpiringExternalApp;
                return (
                  <div
                    key={`app-${appItem.appInfo.clientName}-${appItem.appInfo.appName}-${index}`}
                    className={cn(
                      "px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0",
                      appItem.appInfo.daysRemaining <= 3 && "bg-purple-500/5"
                    )}
                  >
                    {/* Day Badge */}
                    <div className={cn(
                      "flex-shrink-0 w-14 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold",
                      "text-purple-600 bg-purple-500/20"
                    )}>
                      <AppWindow className="h-4 w-4" />
                      <span className="text-[10px]">{getDayLabel(appItem.appInfo.daysRemaining)}</span>
                    </div>

                    {/* App Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{appItem.appInfo.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <AppWindow className="h-3 w-3" />
                        {appItem.appInfo.appName}
                      </p>
                    </div>

                    {/* WhatsApp Button */}
                    {appItem.appInfo.clientPhone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10 flex-shrink-0"
                        onClick={() => openWhatsApp(appItem.appInfo.clientPhone!, appItem.appInfo.clientName)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }

              // Handle client notifications (annual and regular)
              const clientItem = item as AnnualClientReminder | ExpiringClient;
              return (
                <div
                  key={clientItem.client.id}
                  className={cn(
                    "px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0",
                    index === 0 && !item.isExternalApp && !('isSellerWarning' in item) && "bg-destructive/5"
                  )}
                >
                  {/* Day Badge */}
                  <div className={cn(
                    "flex-shrink-0 w-14 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold",
                    getDayColor(clientItem.isAnnual ? 1 : (clientItem as ExpiringClient).daysRemaining, clientItem.isAnnual)
                  )}>
                    {clientItem.isAnnual ? (
                      <Repeat className="h-4 w-4" />
                    ) : (clientItem as ExpiringClient).daysRemaining === 0 ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-3 w-3 mb-0.5" />
                    )}
                    <span className="text-[10px]">{getDayLabel(clientItem.isAnnual ? 1 : (clientItem as ExpiringClient).daysRemaining, clientItem.isAnnual)}</span>
                  </div>

                  {/* Client Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{clientItem.client.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {clientItem.isAnnual ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Mensal: {format((clientItem as AnnualClientReminder).nextBillingDate, 'dd/MM')}
                        </span>
                      ) : (
                        clientItem.client.plan_name || 'Sem plano'
                      )}
                    </p>
                  </div>

                  {/* WhatsApp Button */}
                  {clientItem.client.phone && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10 flex-shrink-0"
                      onClick={() => openWhatsApp(clientItem.client.phone!, clientItem.client.name)}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}

            {allNotifications.length > 10 && (
              <div className="px-4 py-2 text-center text-xs text-muted-foreground bg-muted/30">
                +{allNotifications.length - 10} outros lembretes
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-muted/30 border-t border-border">
            <Link to="/clients" onClick={() => setIsOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full text-xs">
                Ver todos os clientes
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}