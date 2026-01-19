import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Server, CreditCard, TrendingUp, Shield, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminBroadcastResellers } from '@/components/AdminBroadcastResellers';

export default function AdminDashboard() {
  const { profile } = useAuth();

  // Buscar estatísticas gerais
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [sellersResult, clientsResult, serversResult] = await Promise.all([
        supabase.from('profiles').select('id, is_active, subscription_expires_at', { count: 'exact' }),
        supabase.from('clients').select('id', { count: 'exact' }),
        supabase.from('servers').select('id', { count: 'exact' })
      ]);

      const totalSellers = sellersResult.count || 0;
      const activeSellers = sellersResult.data?.filter(p => p.is_active !== false).length || 0;
      const totalClients = clientsResult.count || 0;
      const totalServers = serversResult.count || 0;

      return {
        totalSellers,
        activeSellers,
        totalClients,
        totalServers
      };
    }
  });

  // Buscar vendedores recentes
  const { data: recentSellers = [] } = useQuery({
    queryKey: ['admin-recent-sellers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at, is_active, subscription_expires_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    }
  });

  const statCards = [
    {
      title: 'Total Vendedores',
      value: stats?.totalSellers || 0,
      description: `${stats?.activeSellers || 0} ativos`,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Total Clientes',
      value: stats?.totalClients || 0,
      description: 'Em toda a plataforma',
      icon: CreditCard,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Total Servidores',
      value: stats?.totalServers || 0,
      description: 'Cadastrados',
      icon: Server,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Sistema',
      value: 'Online',
      description: 'Funcionando normalmente',
      icon: Activity,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-500" />
            Painel Administrativo
          </h1>
          <p className="text-slate-400 mt-1">
            Bem-vindo, {profile?.full_name || 'Administrador'}
          </p>
        </div>
        <AdminBroadcastResellers />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <p className="text-xs text-slate-400 mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Sellers */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Vendedores Recentes
          </CardTitle>
          <CardDescription className="text-slate-400">
            Últimos vendedores cadastrados na plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentSellers.length === 0 ? (
              <p className="text-slate-500 text-center py-4">Nenhum vendedor cadastrado</p>
            ) : (
              recentSellers.map((seller) => (
                <div
                  key={seller.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                      {(seller.full_name || seller.email)?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {seller.full_name || 'Sem nome'}
                      </p>
                      <p className="text-sm text-slate-400">{seller.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      seller.is_active !== false
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {seller.is_active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      {format(new Date(seller.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
