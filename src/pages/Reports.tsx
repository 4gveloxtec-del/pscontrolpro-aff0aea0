import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, TrendingUp, Server, Calendar, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { startOfMonth, isBefore, startOfToday } from 'date-fns';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';

export default function Reports() {
  const { isAdmin } = useAuth();
  const { isMoneyHidden, toggleMoneyVisibility, maskData } = usePrivacyMode();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const today = startOfToday();
  const monthStart = startOfMonth(today);

  const { data: stats } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const [profilesRes, clientsRes, serversRes] = await Promise.all([
        supabase.from('profiles').select('id, subscription_expires_at, is_permanent'),
        supabase.from('clients').select('id, plan_price, premium_price, is_paid, renewed_at, expiration_date, is_archived'),
        supabase.from('servers').select('id, monthly_cost, is_active'),
      ]);

      const profiles = profilesRes.data || [];
      const allClients = clientsRes.data || [];
      const servers = serversRes.data || [];

      // Filter only active (non-archived) clients
      const clients = allClients.filter(c => !c.is_archived);

      // Paid clients only
      const paidClients = clients.filter(c => c.is_paid);

      // AUDIT FIX: Safe numeric coercion for total revenue
      const totalRevenue = paidClients.reduce((sum, c) => {
        const planPrice = Number(c.plan_price) || 0;
        const premiumPrice = Number(c.premium_price) || 0;
        return sum + planPrice + premiumPrice;
      }, 0);
      
      // Monthly revenue = only clients renewed THIS MONTH with valid expiration
      // AUDIT FIX: Normalize dates to noon to avoid timezone issues
      const clientsRenewedThisMonth = clients.filter(c => {
        if (!c.renewed_at || !c.is_paid) return false;
        const renewedStr = c.renewed_at.includes('T') ? c.renewed_at : `${c.renewed_at}T12:00:00`;
        const expStr = c.expiration_date.includes('T') ? c.expiration_date : `${c.expiration_date}T12:00:00`;
        const renewedDate = new Date(renewedStr);
        const expDate = new Date(expStr);
        return !isBefore(renewedDate, monthStart) && !isBefore(expDate, today);
      });
      const monthlyRevenue = clientsRenewedThisMonth.reduce((sum, c) => {
        const planPrice = Number(c.plan_price) || 0;
        const premiumPrice = Number(c.premium_price) || 0;
        return sum + planPrice + premiumPrice;
      }, 0);

      const totalServerCosts = servers
        .filter(s => s.is_active)
        .reduce((sum, s) => sum + (s.monthly_cost || 0), 0);

      return {
        totalSellers: profiles.length,
        totalClients: clients.length,
        totalRevenue,
        monthlyRevenue,
        renewedThisMonth: clientsRenewedThisMonth.length,
        totalServerCosts,
        paidClients: paidClients.length,
        unpaidClients: clients.filter(c => !c.is_paid).length,
        activeServers: servers.filter(s => s.is_active).length,
      };
    },
  });

  const formatCurrency = (value: number) => {
    if (isMoneyHidden) {
      return maskData(value, 'money');
    }
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">Visão geral do sistema</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleMoneyVisibility}
          className="gap-2"
        >
          {isMoneyHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {isMoneyHidden ? 'Mostrar Valores' : 'Ocultar Valores'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Vendedores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalSellers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.paidClients || 0} pagos / {stats?.unpaidClients || 0} pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Receita do Mês</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {formatCurrency(stats?.monthlyRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.renewedThisMonth || 0} renovações este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Custos de Servidores</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {formatCurrency(stats?.totalServerCosts || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeServers || 0} servidores ativos
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Lucro Mensal Estimado
            </CardTitle>
            <CardDescription>Receita do mês menos custos de servidores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {formatCurrency((stats?.monthlyRevenue || 0) - (stats?.totalServerCosts || 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Receita Total (Clientes Pagos)
            </CardTitle>
            <CardDescription>Soma de todos os planos de clientes ativos e pagos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-success">
              {formatCurrency(stats?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.paidClients || 0} clientes pagos × valor médio dos planos
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Funcionalidades Futuras
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Gráficos de evolução mensal</li>
            <li>Relatório por vendedor</li>
            <li>Exportação para Excel/PDF</li>
            <li>Métricas de conversão</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}