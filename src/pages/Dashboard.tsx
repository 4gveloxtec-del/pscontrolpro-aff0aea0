import { useAuth } from '@/hooks/useAuth';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { StatCard } from '@/components/dashboard/StatCard';
import { MonthlyProfitHistory } from '@/components/dashboard/MonthlyProfitHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, Clock, AlertTriangle, DollarSign, TrendingUp, Bell, Send, Copy, ExternalLink, Timer, Server, Trash2, Archive, Smartphone, Settings, UserPlus, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays, isBefore, isAfter, startOfToday, differenceInDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SendMessageDialog } from '@/components/SendMessageDialog';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

// Admin contact info for renewals
const ADMIN_WHATSAPP = '5531998518865';
const ADMIN_PIX = 'sandelrodrig@gmail.com';
const ADMIN_NAME = 'Sandel';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  expiration_date: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_price: number | null;
  premium_price: number | null;
  is_paid: boolean | null;
  category: string | null;
  login: string | null;
  password: string | null;
  premium_password: string | null;
  server_name: string | null;
  server_id: string | null;
  telegram: string | null;
  is_archived: boolean | null;
  renewed_at: string | null;
}

interface ServerData {
  id: string;
  name: string;
  monthly_cost: number | null;
  is_credit_based: boolean | null;
  is_active: boolean | null;
}

export default function Dashboard() {
  const { user, profile, isAdmin, isSeller } = useAuth();
  const { isPrivacyMode, maskData, isMoneyHidden, toggleMoneyVisibility } = usePrivacyMode();
  const [messageClient, setMessageClient] = useState<Client | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('seller_id', user.id)
        .eq('is_archived', false);
      if (error) throw error;
      return data as Client[] || [];
    },
    enabled: !!user?.id && isSeller,
  });

  // Fetch servers for profit calculation
  const { data: serversData = [] } = useQuery({
    queryKey: ['servers-dashboard', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, monthly_cost, is_credit_based, is_active')
        .eq('seller_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      return data as ServerData[] || [];
    },
    enabled: !!user?.id && isSeller,
  });

  // Fetch archived clients count
  const { data: archivedCount = 0 } = useQuery({
    queryKey: ['archived-clients-count', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return 0;
      const { count, error } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('is_archived', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id && isSeller,
  });

  // Fetch bills to pay for total costs
  const { data: billsData = [] } = useQuery({
    queryKey: ['bills-dashboard', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      const { data, error } = await supabase
        .from('bills_to_pay')
        .select('amount, is_paid')
        .eq('seller_id', user.id)
        .eq('is_paid', false);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isSeller,
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers-dashboard'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, subscription_expires_at, is_permanent, is_active, full_name, email');
      if (profilesError) throw profilesError;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const adminIds = roles?.filter(r => r.role === 'admin').map(r => r.user_id) || [];
      
      return (profiles || []).filter(p => !adminIds.includes(p.id) && p.is_active !== false);
    },
    enabled: isAdmin,
  });

  // Fetch admin monthly profits for tracking reseller renewals
  const { data: adminMonthlyProfits = [] } = useQuery({
    queryKey: ['admin-monthly-profits', user?.id],
    queryFn: async () => {
      if (!user?.id || !isAdmin) return [];
      const { data, error } = await supabase
        .from('monthly_profits')
        .select('*')
        .eq('seller_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isAdmin,
  });

  // Fetch app settings (price)
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');
      if (error) throw error;
      return data || [];
    },
  });

  const appMonthlyPrice = appSettings?.find(s => s.key === 'app_monthly_price')?.value || '25';
  const gerenciaAppPanelUrl = appSettings?.find(s => s.key === 'gerencia_app_panel_url')?.value || '';
  const gerenciaAppRegisterUrl = appSettings?.find(s => s.key === 'gerencia_app_register_url')?.value || '';

  const today = startOfToday();
  const nextWeek = addDays(today, 7);
  const monthStart = startOfMonth(today);

  // Seller stats
  const activeClients = clients.filter(c => 
    isAfter(new Date(c.expiration_date), today) || 
    format(new Date(c.expiration_date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  );
  const expiringClients = clients.filter(c => {
    const expDate = new Date(c.expiration_date);
    return isAfter(expDate, today) && isBefore(expDate, nextWeek);
  });
  const expiredClients = clients.filter(c => isBefore(new Date(c.expiration_date), today));
  const unpaidClients = clients.filter(c => !c.is_paid);

  // Count clients renewed this month (for monthly revenue)
  const clientsRenewedThisMonth = clients.filter(c => {
    if (!c.renewed_at || !c.is_paid) return false;
    const renewedDate = new Date(c.renewed_at);
    return !isBefore(renewedDate, monthStart) && !isBefore(new Date(c.expiration_date), today);
  });

  // Monthly revenue: only clients renewed this month (plan_price + premium_price)
  const monthlyRevenue = clientsRenewedThisMonth.reduce((sum, c) => sum + (c.plan_price || 0) + (c.premium_price || 0), 0);

  const totalRevenue = monthlyRevenue;

  // Total server costs
  const totalServerCosts = serversData.reduce((sum, s) => sum + (s.monthly_cost || 0), 0);
  
  // Total bills costs
  const totalBillsCosts = billsData.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  
  // Net profit (revenue - server costs - bills)
  const netProfit = totalRevenue - totalServerCosts - totalBillsCosts;

  // Calculate profit per server (based on monthly renewals)
  const serverProfits = serversData.map(server => {
    const serverClients = clients.filter(c => {
      if (c.server_id !== server.id || !c.is_paid || !c.renewed_at) return false;
      const renewedDate = new Date(c.renewed_at);
      return !isBefore(renewedDate, monthStart) && !isBefore(new Date(c.expiration_date), today);
    });
    const serverRevenue = serverClients.reduce((sum, c) => sum + (c.plan_price || 0) + (c.premium_price || 0), 0);
    const serverCost = server.monthly_cost || 0;
    const serverProfit = serverRevenue - serverCost;
    
    return {
      ...server,
      clientCount: serverClients.length,
      revenue: serverRevenue,
      cost: serverCost,
      profit: serverProfit,
    };
  }).sort((a, b) => b.profit - a.profit);

  // Get all unique categories from clients (handle object categories)
  const getCategoryString = (cat: unknown): string => {
    if (!cat) return 'Sem categoria';
    if (typeof cat === 'object') return (cat as { name?: string })?.name || 'Sem categoria';
    return String(cat);
  };
  
  const allCategories = [...new Set(clients.map(c => getCategoryString(c.category)))];

  // Calculate revenue per category (based on monthly renewals)
  const categoryProfits = allCategories.map(category => {
    const categoryClients = clients.filter(c => {
      if (getCategoryString(c.category) !== category || !c.is_paid || !c.renewed_at) return false;
      const renewedDate = new Date(c.renewed_at);
      return !isBefore(renewedDate, monthStart) && !isBefore(new Date(c.expiration_date), today);
    });
    const categoryRevenue = categoryClients.reduce((sum, c) => sum + (c.plan_price || 0) + (c.premium_price || 0), 0);
    const totalCategoryClients = clients.filter(c => getCategoryString(c.category) === category).length;
    
    return {
      category,
      clientCount: categoryClients.length,
      totalClients: totalCategoryClients,
      revenue: categoryRevenue,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Clients expiring in specific days (1, 2, 3, 4, 5 days)
  const getClientsExpiringInDays = (days: number) => {
    return clients.filter(c => {
      const expDate = new Date(c.expiration_date);
      const diff = differenceInDays(expDate, today);
      return diff === days;
    });
  };

  // Clients expiring from 1 to 5 days, sorted by days remaining
  const urgentClients = clients
    .map(c => ({
      ...c,
      daysRemaining: differenceInDays(new Date(c.expiration_date), today)
    }))
    .filter(c => c.daysRemaining >= 0 && c.daysRemaining <= 5)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const expiringToday = getClientsExpiringInDays(0);
  const expiring1Day = getClientsExpiringInDays(1);
  const expiring2Days = getClientsExpiringInDays(2);
  const expiring3Days = getClientsExpiringInDays(3);

  const getDaysBadgeColor = (days: number) => {
    if (days === 0) return 'bg-destructive text-destructive-foreground';
    if (days === 1) return 'bg-destructive/80 text-destructive-foreground';
    if (days === 2) return 'bg-warning text-warning-foreground';
    if (days === 3) return 'bg-warning/70 text-warning-foreground';
    return 'bg-muted text-muted-foreground';
  };

  // Admin stats
  const activeSellers = sellers.filter(s => {
    if (s.is_permanent) return true;
    if (!s.subscription_expires_at) return false;
    const date = new Date(s.subscription_expires_at);
    return !isNaN(date.getTime()) && isAfter(date, today);
  });
  const expiredSellers = sellers.filter(s => {
    if (s.is_permanent) return false;
    if (!s.subscription_expires_at) return false;
    const date = new Date(s.subscription_expires_at);
    return !isNaN(date.getTime()) && isBefore(date, today);
  });

  // Admin financial calculations
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const currentMonthProfit = adminMonthlyProfits.find(p => p.month === currentMonth && p.year === currentYear);
  
  // Total revenue from all saved months (historical)
  const adminTotalRevenue = adminMonthlyProfits.reduce((sum, p) => sum + (p.revenue || 0), 0);
  
  // Current month revenue (from saved profit or calculate potential)
  const adminMonthlyRevenue = currentMonthProfit?.revenue || 0;
  
  // Estimated profit from active sellers (potential monthly income)
  const pricePerMonth = parseFloat(appMonthlyPrice) || 25;
  const payingSellersCount = activeSellers.filter(s => !s.is_permanent).length;
  const adminEstimatedMonthlyProfit = payingSellersCount * pricePerMonth;

  // Subscription days remaining for seller
  const subscriptionDaysRemaining = profile?.subscription_expires_at 
    ? differenceInDays(new Date(profile.subscription_expires_at), today)
    : null;
  
  const isOnTrial = subscriptionDaysRemaining !== null && subscriptionDaysRemaining <= 5 && subscriptionDaysRemaining >= 0;
  const needsRenewalWarning = subscriptionDaysRemaining !== null && subscriptionDaysRemaining <= 3 && !profile?.is_permanent;

  const copyPixKey = () => {
    navigator.clipboard.writeText(ADMIN_PIX);
    toast.success('Chave PIX copiada!');
  };

  const openWhatsAppAdmin = () => {
    const message = encodeURIComponent(`Olá ${ADMIN_NAME}! Gostaria de renovar minha assinatura do PSControl. Meu email: ${profile?.email}`);
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${message}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Subscription Counter Banner */}
      {isSeller && !profile?.is_permanent && subscriptionDaysRemaining !== null && (
        <Card className={cn(
          "border-2 overflow-hidden",
          subscriptionDaysRemaining <= 0 ? "border-destructive bg-destructive/10" :
          subscriptionDaysRemaining <= 3 ? "border-warning bg-gradient-to-r from-warning/20 to-destructive/20" :
          subscriptionDaysRemaining <= 5 ? "border-warning/50 bg-warning/10" :
          "border-primary/30 bg-primary/5"
        )}>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Counter */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  "flex flex-col items-center justify-center w-20 h-20 rounded-2xl",
                  subscriptionDaysRemaining <= 0 ? "bg-destructive text-destructive-foreground" :
                  subscriptionDaysRemaining <= 3 ? "bg-warning text-warning-foreground" :
                  "bg-primary text-primary-foreground"
                )}>
                  <Timer className="h-5 w-5 mb-1" />
                  <span className="text-3xl font-bold">{Math.max(0, subscriptionDaysRemaining)}</span>
                  <span className="text-[10px] uppercase">dias</span>
                </div>
                <div>
                  <h3 className={cn(
                    "font-bold text-lg",
                    subscriptionDaysRemaining <= 0 ? "text-destructive" :
                    subscriptionDaysRemaining <= 3 ? "text-warning" : "text-foreground"
                  )}>
                    {subscriptionDaysRemaining <= 0 ? 'Assinatura Expirada!' :
                     subscriptionDaysRemaining <= 3 ? 'Renove sua Assinatura!' :
                     isOnTrial ? 'Período de Teste' : 'Sua Assinatura'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {subscriptionDaysRemaining <= 0 
                      ? 'Seu acesso foi suspenso. Renove para continuar usando.'
                      : subscriptionDaysRemaining <= 3
                        ? `Faltam apenas ${subscriptionDaysRemaining} dia${subscriptionDaysRemaining > 1 ? 's' : ''} para expirar!`
                        : `Expira em ${format(new Date(profile.subscription_expires_at!), "dd 'de' MMMM", { locale: ptBR })}`
                    }
                  </p>
                </div>
              </div>

              {/* Renewal Info - Show when 3 days or less */}
              {needsRenewalWarning && (
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-card/80 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-muted-foreground">Valor da renovação:</p>
                    <p className="text-lg font-bold text-primary">R$ {appMonthlyPrice},00/mês</p>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Para renovar, envie o comprovante para:</p>
                  
                  {/* PIX Key */}
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm font-mono truncate">
                      {ADMIN_PIX}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyPixKey}
                      className="gap-1 shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      Copiar PIX
                    </Button>
                  </div>

                  {/* WhatsApp Button */}
                  <Button
                    onClick={openWhatsAppAdmin}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Enviar Comprovante no WhatsApp
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo, <span className="text-foreground font-medium">{maskData(profile?.full_name || 'Usuário', 'name')}</span>!
          {isAdmin && <span className="ml-2 text-primary">(Administrador)</span>}
        </p>
      </div>

      {/* Seller Dashboard */}
      {isSeller && (
        <>
          {/* Urgent Notifications */}
          {(expiringToday.length > 0 || expiring1Day.length > 0 || expiring2Days.length > 0 || expiring3Days.length > 0) && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              {expiringToday.length > 0 && (
                <Card className="border-destructive bg-destructive/10">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-full bg-destructive/20">
                      <Bell className="h-4 w-4 text-destructive animate-pulse" />
                    </div>
                    <div>
                      <p className="text-xs text-destructive font-medium">Vence HOJE</p>
                      <p className="text-xl font-bold text-destructive">{expiringToday.length}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {expiring1Day.length > 0 && (
                <Card className="border-destructive/70 bg-destructive/5">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-full bg-destructive/10">
                      <Clock className="h-4 w-4 text-destructive/80" />
                    </div>
                    <div>
                      <p className="text-xs text-destructive/80 font-medium">Vence em 1 dia</p>
                      <p className="text-xl font-bold text-destructive/80">{expiring1Day.length}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {expiring2Days.length > 0 && (
                <Card className="border-warning bg-warning/10">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-full bg-warning/20">
                      <Clock className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <p className="text-xs text-warning font-medium">Vence em 2 dias</p>
                      <p className="text-xl font-bold text-warning">{expiring2Days.length}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {expiring3Days.length > 0 && (
                <Card className="border-warning/60 bg-warning/5">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-full bg-warning/10">
                      <Clock className="h-4 w-4 text-warning/70" />
                    </div>
                    <div>
                      <p className="text-xs text-warning/70 font-medium">Vence em 3 dias</p>
                      <p className="text-xl font-bold text-warning/70">{expiring3Days.length}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total de Clientes"
              value={isPrivacyMode ? '●●' : clients.length}
              icon={Users}
              variant="primary"
            />
            <StatCard
              title="Clientes Ativos"
              value={isPrivacyMode ? '●●' : activeClients.length}
              icon={UserCheck}
              variant="success"
            />
            <StatCard
              title="Vencendo em 7 dias"
              value={isPrivacyMode ? '●●' : expiringClients.length}
              icon={Clock}
              variant="warning"
            />
            <StatCard
              title="Vencidos"
              value={isPrivacyMode ? '●●' : expiredClients.length}
              icon={AlertTriangle}
              variant="danger"
            />
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Resumo Financeiro</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMoneyVisibility}
              className="gap-2"
              title={isMoneyHidden ? "Mostrar valores" : "Ocultar valores"}
            >
              {isMoneyHidden ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  <span className="text-xs">Mostrar</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  <span className="text-xs">Ocultar</span>
                </>
              )}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-success" />
                  Receita
                </CardTitle>
                <CardDescription>Clientes ativos e pagos</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-success">
                  {maskData(`R$ ${totalRevenue.toFixed(2)}`, 'money')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-destructive" />
                  Custos Fixos
                </CardTitle>
                <CardDescription>Servidores ativos</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-destructive">
                  {maskData(`R$ ${totalServerCosts.toFixed(2)}`, 'money')}
                </p>
              </CardContent>
            </Card>

            <Card className={cn(
              "border-2",
              netProfit >= 0 ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"
            )}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className={cn("h-5 w-5", netProfit >= 0 ? "text-success" : "text-destructive")} />
                  Lucro Líquido
                </CardTitle>
                <CardDescription>Receita - Custos</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={cn("text-3xl font-bold", netProfit >= 0 ? "text-success" : "text-destructive")}>
                  {maskData(`R$ ${netProfit.toFixed(2)}`, 'money')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Profit History */}
          {user?.id && (
            <MonthlyProfitHistory
              sellerId={user.id}
              currentRevenue={totalRevenue}
              currentServerCosts={totalServerCosts}
              currentBillsCosts={totalBillsCosts}
              currentNetProfit={netProfit}
              currentActiveClients={activeClients.length}
              isPrivacyMode={isPrivacyMode}
              maskData={maskData}
            />
          )}

          {/* Server Profits Section */}
          {serverProfits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Lucro por Servidor
                </CardTitle>
                <CardDescription>Receita dos clientes ativos menos custo mensal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {serverProfits.map(server => (
                    <div 
                      key={server.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        server.profit >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-full",
                          server.profit >= 0 ? "bg-success/20" : "bg-destructive/20"
                        )}>
                          <Server className={cn("h-4 w-4", server.profit >= 0 ? "text-success" : "text-destructive")} />
                        </div>
                        <div>
                          <p className="font-medium">{server.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {server.clientCount} cliente{server.clientCount !== 1 ? 's' : ''} • 
                            Custo: {maskData(`R$ ${server.cost.toFixed(2)}`, 'money')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Receita: {maskData(`R$ ${server.revenue.toFixed(2)}`, 'money')}</p>
                        <p className={cn("font-bold", server.profit >= 0 ? "text-success" : "text-destructive")}>
                          {maskData(`R$ ${server.profit.toFixed(2)}`, 'money')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category Revenue Section */}
          {categoryProfits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Receita por Categoria
                </CardTitle>
                <CardDescription>Receita dos clientes ativos e pagos por categoria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryProfits.map(cat => {
                    const getCategoryColor = (category: string) => {
                      switch (category) {
                        case 'IPTV': return 'bg-blue-500/10 border-blue-500/30 text-blue-600';
                        case 'P2P': return 'bg-purple-500/10 border-purple-500/30 text-purple-600';
                        case 'SSH': return 'bg-orange-500/10 border-orange-500/30 text-orange-600';
                        case 'Contas Premium': return 'bg-amber-500/10 border-amber-500/30 text-amber-600';
                        default: return 'bg-primary/10 border-primary/30 text-primary';
                      }
                    };
                    const getCategoryIcon = (category: string) => {
                      switch (category) {
                        case 'IPTV': return '📺';
                        case 'P2P': return '🌐';
                        case 'SSH': return '🔒';
                        case 'Contas Premium': return '⭐';
                        default: return '📁';
                      }
                    };
                    
                    return (
                      <div 
                        key={cat.category}
                        className={cn(
                          "flex flex-col p-4 rounded-lg border",
                          getCategoryColor(cat.category)
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{getCategoryIcon(cat.category)}</span>
                          <span className="font-semibold">{cat.category}</span>
                        </div>
                        <p className="text-2xl font-bold">
                          {maskData(`R$ ${cat.revenue.toFixed(2)}`, 'money')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cat.clientCount} ativo{cat.clientCount !== 1 ? 's' : ''} de {cat.totalClients} total
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {archivedCount > 0 && (
            <Card className="border-muted bg-muted/20">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <Archive className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Lixeira</p>
                      <p className="text-sm text-muted-foreground">{archivedCount} cliente{archivedCount !== 1 ? 's' : ''} arquivado{archivedCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <Link to="/clients?filter=archived">
                    <Button variant="outline" size="sm">Ver lixeira</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resumo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clientes não pagos:</span>
                <span className="font-medium text-destructive">{isPrivacyMode ? '●●' : unpaidClients.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Média por cliente:</span>
                <span className="font-medium">
                  {maskData(`R$ ${activeClients.length > 0 ? (totalRevenue / activeClients.length).toFixed(2) : '0.00'}`, 'money')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servidores ativos:</span>
                <span className="font-medium">{serversData.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Urgent Clients List - Sorted by days remaining */}
          {urgentClients.length > 0 && (
            <Card className="border-warning/50 bg-gradient-to-br from-warning/5 to-transparent">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-warning flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Clientes Vencendo (0-5 dias)
                  </CardTitle>
                  <Link to="/clients">
                    <Button variant="outline" size="sm">Ver todos</Button>
                  </Link>
                </div>
                <CardDescription>Ordenados por urgência - clique para enviar mensagem</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {urgentClients.map((client) => (
                    <div 
                      key={client.id} 
                      className="flex justify-between items-center py-3 px-3 rounded-lg bg-card/50 border border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={cn("text-xs font-bold min-w-[70px] justify-center", getDaysBadgeColor(client.daysRemaining))}>
                          {client.daysRemaining === 0 ? 'HOJE' : `${client.daysRemaining} dia${client.daysRemaining > 1 ? 's' : ''}`}
                        </Badge>
                        <div>
                          <p className="font-medium">{maskData(client.name, 'name')}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.plan_name} • {format(new Date(client.expiration_date), "dd/MM/yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {client.phone && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMessageClient(client)}
                            className="gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <Send className="h-4 w-4" />
                            <span className="hidden sm:inline">Mensagem</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Admin Dashboard */}
      {isAdmin && (
        <>
          {/* Admin Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total de Vendedores"
              value={isPrivacyMode ? '●●' : sellers.length}
              icon={Users}
              variant="primary"
            />
            <StatCard
              title="Vendedores Ativos"
              value={isPrivacyMode ? '●●' : activeSellers.length}
              icon={UserCheck}
              variant="success"
            />
            <StatCard
              title="Assinaturas Expiradas"
              value={isPrivacyMode ? '●●' : expiredSellers.length}
              icon={AlertTriangle}
              variant="danger"
            />
            <StatCard
              title="Permanentes"
              value={isPrivacyMode ? '●●' : sellers.filter(s => s.is_permanent).length}
              icon={TrendingUp}
              variant="default"
            />
          </div>

          {/* Admin Financial Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-success/30 bg-gradient-to-br from-success/5 to-success/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Arrecadado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-success">
                  {isPrivacyMode ? 'R$ ●●●' : `R$ ${adminTotalRevenue.toFixed(2).replace('.', ',')}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Soma de todas as renovações salvas
                </p>
                {adminMonthlyRevenue > 0 && (
                  <p className="text-sm text-success/80 mt-2">
                    +R$ {adminMonthlyRevenue.toFixed(2).replace('.', ',')} este mês
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Lucro Estimado Mensal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {isPrivacyMode ? 'R$ ●●●' : `R$ ${adminEstimatedMonthlyProfit.toFixed(2).replace('.', ',')}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {payingSellersCount} vendedores pagantes × R$ {pricePerMonth.toFixed(2).replace('.', ',')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Profit History for Admin */}
          {user?.id && (
            <MonthlyProfitHistory 
              sellerId={user.id}
              currentRevenue={adminMonthlyRevenue}
              currentServerCosts={0}
              currentBillsCosts={0}
              currentNetProfit={adminMonthlyRevenue}
              currentActiveClients={payingSellersCount}
              isPrivacyMode={isPrivacyMode}
              maskData={maskData}
            />
          )}

          {/* GerenciaApp Admin Card */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>GerenciaApp</CardTitle>
                    <CardDescription>Painel de gerenciamento de apps</CardDescription>
                  </div>
                </div>
                <Link to="/settings">
                  <Button variant="outline" size="sm" className="gap-1">
                    <Settings className="h-4 w-4" />
                    Configurar
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {gerenciaAppPanelUrl ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{gerenciaAppPanelUrl}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => window.open(gerenciaAppPanelUrl, '_blank')}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Acessar Painel
                    </Button>
                    {gerenciaAppRegisterUrl && (
                      <Button variant="outline" onClick={() => window.open(gerenciaAppRegisterUrl, '_blank')}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Link de Cadastro
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground text-sm">Nenhum painel configurado</p>
                  <Link to="/settings">
                    <Button variant="link" className="gap-1 mt-2">
                      <Settings className="h-4 w-4" />
                      Configurar GerenciaApp
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Painel Administrativo</CardTitle>
              <CardDescription>
                Gerencie vendedores, planos e configurações do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Use o menu lateral para acessar as funcionalidades administrativas.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Message Dialog */}
      {messageClient && (
        <SendMessageDialog
          client={messageClient}
          open={!!messageClient}
          onOpenChange={(open) => !open && setMessageClient(null)}
        />
      )}
    </div>
  );
}
