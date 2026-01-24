import { useAuth } from '@/hooks/useAuth';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { StatCard } from '@/components/dashboard/StatCard';
import { MonthlyProfitHistory } from '@/components/dashboard/MonthlyProfitHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, Clock, AlertTriangle, DollarSign, TrendingUp, Bell, Send, Copy, ExternalLink, Timer, Server, Archive, Smartphone, Settings, UserPlus, Eye, EyeOff, X, Filter, MessageCircle } from 'lucide-react';
import { RecentAutoMessages } from '@/components/dashboard/RecentAutoMessages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays, isBefore, isAfter, startOfToday, differenceInDays, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';
import { SendMessageDialog } from '@/components/SendMessageDialog';
import { BulkCollectionDialog } from '@/components/BulkCollectionDialog';
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
  const { isPrivacyMode, maskData, isMoneyHidden, toggleMoneyVisibility, isClientNumbersHidden, toggleClientNumbersVisibility } = usePrivacyMode();
  const [messageClient, setMessageClient] = useState<Client | null>(null);
  const [expirationFilter, setExpirationFilter] = useState<number | null>(null);
  const [bulkCollectionOpen, setBulkCollectionOpen] = useState(false);
  const clientsListRef = useRef<HTMLDivElement>(null);

  // ============= PERF: Queries agregadas no banco =============
  // Em vez de carregar TODOS os clientes, usamos queries separadas e otimizadas
  
  const todayStr = format(startOfToday(), 'yyyy-MM-dd');
  const nextWeekStr = format(addDays(startOfToday(), 7), 'yyyy-MM-dd');
  const monthStartStr = format(startOfMonth(startOfToday()), 'yyyy-MM-dd');

  // Query 1: Stats agregadas (COUNT)
  const { data: clientStats } = useQuery({
    queryKey: ['dashboard-client-stats', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return null;
      
      // Buscar contagens em paralelo
      const [totalRes, activeRes, expiredRes, unpaidRes, expiringWeekRes] = await Promise.all([
        // Total de clientes não arquivados
        supabase.from('clients').select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id).eq('is_archived', false),
        // Clientes ativos (vencimento >= hoje)
        supabase.from('clients').select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id).eq('is_archived', false).gte('expiration_date', todayStr),
        // Clientes vencidos (vencimento < hoje)
        supabase.from('clients').select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id).eq('is_archived', false).lt('expiration_date', todayStr),
        // Clientes não pagos
        supabase.from('clients').select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id).eq('is_archived', false).eq('is_paid', false),
        // Vencendo em 7 dias (hoje <= vencimento < hoje+7)
        supabase.from('clients').select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id).eq('is_archived', false)
          .gte('expiration_date', todayStr).lt('expiration_date', nextWeekStr),
      ]);
      
      return {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        expired: expiredRes.count || 0,
        unpaid: unpaidRes.count || 0,
        expiringWeek: expiringWeekRes.count || 0,
      };
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // Query 2: Receita mensal (SUM de clientes renovados no mês)
  const { data: monthlyRevenueData } = useQuery({
    queryKey: ['dashboard-monthly-revenue', user?.id, monthStartStr],
    queryFn: async () => {
      if (!user?.id || !isSeller) return { revenue: 0, count: 0 };
      
      // Buscar clientes renovados neste mês com vencimento válido
      const { data, error } = await supabase
        .from('clients')
        .select('plan_price, premium_price')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', true)
        .gte('renewed_at', monthStartStr)
        .gte('expiration_date', todayStr);
      
      if (error) throw error;
      
      const total = (data || []).reduce((sum, c) => {
        return sum + (Number(c.plan_price) || 0) + (Number(c.premium_price) || 0);
      }, 0);
      
      return { revenue: Math.round(total * 100) / 100, count: data?.length || 0 };
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // Query 3: Contagem por dia de vencimento (0-7 dias) para os cards
  const { data: expirationCounts = {} } = useQuery({
    queryKey: ['dashboard-expiration-counts', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return {};
      
      // Buscar contagens para cada dia (0-7)
      const counts: Record<number, number> = {};
      const promises = [];
      
      for (let i = 0; i <= 7; i++) {
        const targetDate = format(addDays(startOfToday(), i), 'yyyy-MM-dd');
        promises.push(
          supabase.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', user.id)
            .eq('is_archived', false)
            .eq('expiration_date', targetDate)
            .then(res => ({ day: i, count: res.count || 0 }))
        );
      }
      
      const results = await Promise.all(promises);
      results.forEach(r => { counts[r.day] = r.count; });
      
      return counts;
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // Query 4: APENAS clientes urgentes (0-7 dias) para a lista e cobrança
  const { data: urgentClients = [] } = useQuery({
    queryKey: ['dashboard-urgent-clients', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, email, expiration_date, plan_id, plan_name, plan_price, premium_price, is_paid, pending_amount, category, login, password, premium_password, server_name, server_id, telegram, is_archived, renewed_at')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .gte('expiration_date', todayStr)
        .lte('expiration_date', nextWeekStr)
        .order('expiration_date', { ascending: true });
      
      if (error) throw error;
      
      // Adicionar daysRemaining e deduplicar por telefone
      const seen = new Set<string>();
      const result: (Client & { daysRemaining: number })[] = [];
      
      for (const c of (data || []) as Client[]) {
        const key = c.phone ? `phone:${String(c.phone).trim()}` : `id:${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        
        const expDate = new Date(c.expiration_date);
        expDate.setHours(12, 0, 0, 0);
        const todayNoon = new Date(startOfToday());
        todayNoon.setHours(12, 0, 0, 0);
        const daysRemaining = Math.round((expDate.getTime() - todayNoon.getTime()) / (1000 * 60 * 60 * 24));
        
        result.push({ ...c, daysRemaining });
      }
      
      return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // Query 5: Dados para lucro por servidor (apenas agregados)
  const { data: serverRevenueData = [] } = useQuery({
    queryKey: ['dashboard-server-revenue', user?.id, monthStartStr],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('server_id, plan_price, premium_price')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', true)
        .gte('renewed_at', monthStartStr)
        .gte('expiration_date', todayStr)
        .not('server_id', 'is', null);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  // Query 6: Dados para receita por categoria (apenas agregados)
  const { data: categoryRevenueData = [] } = useQuery({
    queryKey: ['dashboard-category-revenue', user?.id, monthStartStr],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('category, plan_price, premium_price')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', true)
        .gte('renewed_at', monthStartStr)
        .gte('expiration_date', todayStr);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  // Query 7: Total de clientes por categoria (para exibir X de Y)
  const { data: categoryTotalsData = [] } = useQuery({
    queryKey: ['dashboard-category-totals', user?.id],
    queryFn: async () => {
      if (!user?.id || !isSeller) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('category')
        .eq('seller_id', user.id)
        .eq('is_archived', false);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && isSeller,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  // Fetch servers for profit calculation (with cache optimization)
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
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes cache
    refetchOnWindowFocus: false,
  });

  // Fetch archived clients count (with cache optimization)
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
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes cache
    refetchOnWindowFocus: false,
  });

  // Fetch bills to pay for total costs (with cache optimization)
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
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes cache
    refetchOnWindowFocus: false,
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

  // Fetch app settings (price) - with long cache since rarely changes
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour cache
    refetchOnWindowFocus: false,
  });

  const appMonthlyPrice = appSettings?.find(s => s.key === 'app_monthly_price')?.value || '25';
  const gerenciaAppPanelUrl = appSettings?.find(s => s.key === 'gerencia_app_panel_url')?.value || '';
  const gerenciaAppRegisterUrl = appSettings?.find(s => s.key === 'gerencia_app_register_url')?.value || '';

  const today = startOfToday();
  const nextWeek = addDays(today, 7);
  const monthStart = startOfMonth(today);

  // ============= PERF: Usar dados agregados em vez de processar no JS =============
  
  // Stats de clientes - usando query agregada
  const totalClientsCount = clientStats?.total || 0;
  const activeClientsCount = clientStats?.active || 0;
  const expiredClientsCount = clientStats?.expired || 0;
  const unpaidClientsCount = clientStats?.unpaid || 0;
  const expiringWeekCount = clientStats?.expiringWeek || 0;

  // Receita mensal - da query agregada
  const monthlyRevenue = monthlyRevenueData?.revenue || 0;
  const totalRevenue = monthlyRevenue;

  // Total server costs
  const totalServerCosts = serversData.reduce((sum, s) => {
    const cost = Number(s.monthly_cost) || 0;
    return sum + (cost > 0 ? cost : 0);
  }, 0);
  
  // Total bills costs
  const totalBillsCosts = billsData.reduce((sum, b) => {
    const amount = parseFloat(String(b.amount)) || 0;
    return sum + (amount > 0 ? amount : 0);
  }, 0);
  
  // Net profit
  const netProfit = Math.round((totalRevenue - totalServerCosts - totalBillsCosts) * 100) / 100;

  // Lucro por servidor - usando dados agregados
  const serverProfits = serversData.map(server => {
    const serverClients = serverRevenueData.filter(c => c.server_id === server.id);
    const serverRevenue = serverClients.reduce((sum, c) => {
      return sum + (Number(c.plan_price) || 0) + (Number(c.premium_price) || 0);
    }, 0);
    const serverCost = Number(server.monthly_cost) || 0;
    const serverProfit = Math.round((serverRevenue - serverCost) * 100) / 100;
    
    return {
      ...server,
      clientCount: serverClients.length,
      revenue: Math.round(serverRevenue * 100) / 100,
      cost: serverCost,
      profit: serverProfit,
    };
  }).sort((a, b) => b.profit - a.profit);

  // Helper para normalizar categoria
  const getCategoryString = (cat: unknown): string => {
    if (!cat) return 'Sem categoria';
    if (typeof cat === 'object') return ((cat as { name?: string })?.name || 'Sem categoria').trim().toUpperCase();
    return String(cat).trim().toUpperCase();
  };
  
  // Categorias únicas - usando dados agregados
  const allCategories = [...new Set(categoryTotalsData.map(c => getCategoryString(c.category)))];

  // Receita por categoria - usando dados agregados
  const categoryProfits = allCategories.map(category => {
    const categoryClients = categoryRevenueData.filter(c => getCategoryString(c.category) === category);
    const categoryRevenue = categoryClients.reduce((sum, c) => {
      return sum + (Number(c.plan_price) || 0) + (Number(c.premium_price) || 0);
    }, 0);
    const totalCategoryClients = categoryTotalsData.filter(c => getCategoryString(c.category) === category).length;
    
    return {
      category,
      clientCount: categoryClients.length,
      totalClients: totalCategoryClients,
      revenue: Math.round(categoryRevenue * 100) / 100,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Contagens por dia de vencimento - usando query agregada
  const expiringTodayCount = expirationCounts[0] || 0;
  const expiring1DayCount = expirationCounts[1] || 0;
  const expiring2DaysCount = expirationCounts[2] || 0;
  const expiring3DaysCount = expirationCounts[3] || 0;
  const expiring4DaysCount = expirationCounts[4] || 0;
  const expiring5DaysCount = expirationCounts[5] || 0;
  const expiring6DaysCount = expirationCounts[6] || 0;
  const expiring7DaysCount = expirationCounts[7] || 0;

  // Filtrar clientes urgentes por dia selecionado
  const filteredUrgentClients = expirationFilter !== null 
    ? urgentClients.filter(c => c.daysRemaining === expirationFilter)
    : urgentClients;

  const getDaysBadgeColor = (days: number) => {
    if (days === 0) return 'bg-destructive text-destructive-foreground';
    if (days === 1) return 'bg-destructive/80 text-destructive-foreground';
    if (days === 2) return 'bg-warning text-warning-foreground';
    if (days === 3) return 'bg-warning/70 text-warning-foreground';
    return 'bg-muted text-muted-foreground';
  };

  const handleExpirationCardClick = (days: number) => {
    if (expirationFilter === days) {
      // Clear filter if clicking on the same card
      setExpirationFilter(null);
    } else {
      setExpirationFilter(days);
      // Scroll to client list after a short delay
      setTimeout(() => {
        clientsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const clearExpirationFilter = () => {
    setExpirationFilter(null);
  };

  const getExpirationCardLabel = (days: number) => {
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Amanhã';
    const targetDate = addDays(today, days);
    return format(targetDate, 'EEEE', { locale: ptBR }).charAt(0).toUpperCase() + format(targetDate, 'EEEE', { locale: ptBR }).slice(1);
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
          {/* Urgent Notifications - Clickable Cards */}
           {(expiringTodayCount > 0 || expiring1DayCount > 0 || expiring2DaysCount > 0 || expiring3DaysCount > 0 || expiring4DaysCount > 0 || expiring5DaysCount > 0 || expiring6DaysCount > 0 || expiring7DaysCount > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Vencimentos Próximos (clique para filtrar)
                </h3>
                {expirationFilter !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearExpirationFilter}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                    Limpar Filtro
                  </Button>
                )}
              </div>
               <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8">
                {expiringTodayCount > 0 && (
                  <Card 
                    className={cn(
                      "border-destructive bg-destructive/10 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 0 && "ring-2 ring-destructive ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(0)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-destructive/20">
                        <Bell className="h-4 w-4 text-destructive animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs text-destructive font-medium">Hoje</p>
                        <p className="text-xl font-bold text-destructive">{expiringTodayCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {expiring1DayCount > 0 && (
                  <Card 
                    className={cn(
                      "border-destructive/70 bg-destructive/5 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 1 && "ring-2 ring-destructive/70 ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(1)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-destructive/10">
                        <Clock className="h-4 w-4 text-destructive/80" />
                      </div>
                      <div>
                        <p className="text-xs text-destructive/80 font-medium">Amanhã</p>
                        <p className="text-xl font-bold text-destructive/80">{expiring1DayCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {expiring2DaysCount > 0 && (
                  <Card 
                    className={cn(
                      "border-warning bg-warning/10 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 2 && "ring-2 ring-warning ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(2)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-warning/20">
                        <Clock className="h-4 w-4 text-warning" />
                      </div>
                      <div>
                        <p className="text-xs text-warning font-medium">{getExpirationCardLabel(2)}</p>
                        <p className="text-xl font-bold text-warning">{expiring2DaysCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {expiring3DaysCount > 0 && (
                  <Card 
                    className={cn(
                      "border-warning/60 bg-warning/5 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 3 && "ring-2 ring-warning/60 ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(3)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-warning/10">
                        <Clock className="h-4 w-4 text-warning/70" />
                      </div>
                      <div>
                        <p className="text-xs text-warning/70 font-medium">{getExpirationCardLabel(3)}</p>
                        <p className="text-xl font-bold text-warning/70">{expiring3DaysCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {expiring4DaysCount > 0 && (
                  <Card 
                    className={cn(
                      "border-muted bg-muted/10 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 4 && "ring-2 ring-muted-foreground ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(4)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted/20">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">{getExpirationCardLabel(4)}</p>
                        <p className="text-xl font-bold text-muted-foreground">{expiring4DaysCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {expiring5DaysCount > 0 && (
                  <Card 
                    className={cn(
                      "border-muted bg-muted/5 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 5 && "ring-2 ring-muted-foreground ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(5)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted/10">
                        <Clock className="h-4 w-4 text-muted-foreground/70" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground/70 font-medium">{getExpirationCardLabel(5)}</p>
                        <p className="text-xl font-bold text-muted-foreground/70">{expiring5DaysCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {expiring7DaysCount > 0 && (
                  <Card 
                    className={cn(
                      "border-muted bg-muted/5 cursor-pointer transition-all hover:scale-105 hover:shadow-lg",
                      expirationFilter === 7 && "ring-2 ring-muted-foreground ring-offset-2 ring-offset-background"
                    )}
                    onClick={() => handleExpirationCardClick(7)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted/10">
                        <Clock className="h-4 w-4 text-muted-foreground/70" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground/70 font-medium">{getExpirationCardLabel(7)}</p>
                        <p className="text-xl font-bold text-muted-foreground/70">{expiring7DaysCount}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Resumo de Clientes</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleClientNumbersVisibility}
              className="gap-2"
              title={isClientNumbersHidden ? "Mostrar números" : "Ocultar números"}
            >
              {isClientNumbersHidden ? (
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

          <div className="stats-grid">
            <StatCard
              title="Total de Clientes"
              value={maskData(totalClientsCount, 'number')}
              icon={Users}
              variant="primary"
            />
            <StatCard
              title="Clientes Ativos"
              value={maskData(activeClientsCount, 'number')}
              icon={UserCheck}
              variant="success"
            />
            <StatCard
              title="Vencendo em 7 dias"
              value={maskData(expiringWeekCount, 'number')}
              icon={Clock}
              variant="warning"
            />
            <StatCard
              title="Vencidos"
              value={maskData(expiredClientsCount, 'number')}
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

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
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
              currentActiveClients={activeClientsCount}
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
                <span className="font-medium text-destructive">{isPrivacyMode ? '●●' : unpaidClientsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Média por cliente:</span>
                <span className="font-medium">
                  {maskData(`R$ ${activeClientsCount > 0 ? (totalRevenue / activeClientsCount).toFixed(2) : '0.00'}`, 'money')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servidores ativos:</span>
                <span className="font-medium">{serversData.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Auto Messages Widget */}
          <RecentAutoMessages />

          {/* Urgent Clients List - Sorted by days remaining */}
          {urgentClients.length > 0 && (
            <Card 
              ref={clientsListRef}
              className={cn(
                "border-warning/50 bg-gradient-to-br from-warning/5 to-transparent",
                expirationFilter !== null && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-warning flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    {expirationFilter !== null ? (
                      <>
                        Vencendo {expirationFilter === 0 ? 'Hoje' : expirationFilter === 1 ? 'Amanhã' : `em ${expirationFilter} dias`}
                        <Badge variant="secondary" className="ml-2">
                          {filteredUrgentClients.length} cliente{filteredUrgentClients.length !== 1 ? 's' : ''}
                        </Badge>
                      </>
                    ) : (
                      'Clientes Vencendo (0-5 dias)'
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {expirationFilter !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearExpirationFilter}
                        className="gap-1"
                      >
                        <X className="h-4 w-4" />
                        Ver Todos ({urgentClients.length})
                      </Button>
                    )}
                    {filteredUrgentClients.length > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setBulkCollectionOpen(true)}
                        className="gap-1 bg-primary hover:bg-primary/90"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Cobrar Todos ({filteredUrgentClients.length})
                      </Button>
                    )}
                    <Link to="/clients">
                      <Button variant="outline" size="sm">Ir para Clientes</Button>
                    </Link>
                  </div>
                </div>
                <CardDescription>
                  {expirationFilter !== null 
                    ? `Mostrando apenas clientes que vencem ${expirationFilter === 0 ? 'hoje' : expirationFilter === 1 ? 'amanhã' : `em ${expirationFilter} dias`}`
                    : 'Ordenados por urgência - clique para enviar mensagem'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredUrgentClients.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhum cliente encontrado para este filtro.</p>
                      <Button
                        variant="link"
                        onClick={clearExpirationFilter}
                        className="mt-2"
                      >
                        Limpar filtro
                      </Button>
                    </div>
                  ) : (
                    filteredUrgentClients.map((client) => (
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
                              <span className="hidden sm:inline">Cobrar</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
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

      {/* Bulk Collection Dialog */}
      <BulkCollectionDialog
        open={bulkCollectionOpen}
        onOpenChange={setBulkCollectionOpen}
        clients={filteredUrgentClients}
        filterLabel={expirationFilter !== null 
          ? `vencendo ${expirationFilter === 0 ? 'hoje' : expirationFilter === 1 ? 'amanhã' : `em ${expirationFilter} dias`}`
          : 'vencendo em 0-7 dias'
        }
      />
    </div>
  );
}
