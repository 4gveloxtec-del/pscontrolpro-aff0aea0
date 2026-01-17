import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Users, DollarSign, TrendingUp, Server } from 'lucide-react';

export default function Reports() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const { data: stats } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const [profilesRes, clientsRes, serversRes] = await Promise.all([
        supabase.from('profiles').select('id, subscription_expires_at, is_permanent'),
        supabase.from('clients').select('id, plan_price, is_paid'),
        supabase.from('servers').select('id, monthly_cost, is_active'),
      ]);

      const profiles = profilesRes.data || [];
      const clients = clientsRes.data || [];
      const servers = serversRes.data || [];

      const totalRevenue = clients.reduce((sum, c) => sum + (c.plan_price || 0), 0);
      const totalServerCosts = servers
        .filter(s => s.is_active)
        .reduce((sum, s) => sum + (s.monthly_cost || 0), 0);

      return {
        totalSellers: profiles.length,
        totalClients: clients.length,
        totalRevenue,
        totalServerCosts,
        paidClients: clients.filter(c => c.is_paid).length,
        unpaidClients: clients.filter(c => !c.is_paid).length,
        activeServers: servers.filter(s => s.is_active).length,
      };
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground">Visão geral do sistema</p>
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
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              R$ {(stats?.totalRevenue || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Custos de Servidores</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              R$ {(stats?.totalServerCosts || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeServers || 0} servidores ativos
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Lucro Estimado
          </CardTitle>
          <CardDescription>Receita menos custos de servidores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">
            R$ {((stats?.totalRevenue || 0) - (stats?.totalServerCosts || 0)).toFixed(2)}
          </div>
        </CardContent>
      </Card>

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
