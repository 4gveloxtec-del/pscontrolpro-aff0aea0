import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Users, Gift, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
  referral_code: string | null;
}

interface Referral {
  id: string;
  referrer_client_id: string;
  referred_client_id: string;
  discount_percentage: number;
  status: string;
  created_at: string;
}

export default function Referrals() {
  const { user } = useAuth();

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-referrals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, referral_code')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Referral[];
    },
    enabled: !!user?.id,
  });

  const getClientName = (id: string) => {
    return clients.find(c => c.id === id)?.name || 'Cliente desconhecido';
  };

  const statusColors = {
    pending: 'bg-warning/10 text-warning',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-destructive/10 text-destructive',
  };

  const statusLabels = {
    pending: 'Pendente',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sistema de Indicações</h1>
        <p className="text-muted-foreground">Acompanhe as indicações dos seus clientes</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clientes com Código</p>
              <p className="text-2xl font-bold">{clients.filter(c => c.referral_code).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-success/10">
              <Gift className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Indicações Concluídas</p>
              <p className="text-2xl font-bold">{referrals.filter(r => r.status === 'completed').length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <TrendingUp className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Indicações Pendentes</p>
              <p className="text-2xl font-bold">{referrals.filter(r => r.status === 'pending').length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Como funciona o Sistema de Indicações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Cada cliente recebe automaticamente um código de indicação único</p>
          <p>• Quando um novo cliente usa o código, o indicador recebe desconto na próxima renovação</p>
          <p>• O desconto padrão é de 50% do valor do plano</p>
          <p>• Os códigos são gerados automaticamente ao criar um cliente</p>
        </CardContent>
      </Card>

      {/* Clients with Referral Codes */}
      <Card>
        <CardHeader>
          <CardTitle>Códigos de Indicação</CardTitle>
          <CardDescription>Códigos únicos de cada cliente</CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum cliente cadastrado ainda
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {clients.filter(c => c.referral_code).map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <span className="font-medium truncate">{client.name}</span>
                  <code className="text-sm font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {client.referral_code}
                  </code>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referrals History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Indicações</CardTitle>
          <CardDescription>Todas as indicações realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma indicação realizada ainda
            </p>
          ) : (
            <div className="space-y-3">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border"
                >
                  <div>
                    <p className="font-medium">
                      {getClientName(referral.referrer_client_id)} indicou {getClientName(referral.referred_client_id)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(referral.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {referral.discount_percentage}% desconto
                    </span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      statusColors[referral.status as keyof typeof statusColors]
                    )}>
                      {statusLabels[referral.status as keyof typeof statusLabels]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
