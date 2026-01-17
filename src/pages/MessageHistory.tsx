import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { History, Trash2, MessageCircle, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface MessageHistoryItem {
  id: string;
  client_id: string;
  template_id: string | null;
  message_type: string;
  message_content: string;
  sent_at: string;
  phone: string;
}

interface Client {
  id: string;
  name: string;
}

const typeLabels: Record<string, string> = {
  welcome: 'Boas-vindas',
  expiring: 'Vencimento Próximo',
  expired: 'Vencido',
  credentials: 'Credenciais',
  billing: 'Cobrança',
  renewal: 'Renovação',
  custom: 'Personalizado',
};

const typeColors: Record<string, string> = {
  welcome: 'bg-success/10 text-success',
  expiring: 'bg-warning/10 text-warning',
  expired: 'bg-destructive/10 text-destructive',
  credentials: 'bg-primary/10 text-primary',
  billing: 'bg-orange-500/10 text-orange-500',
  renewal: 'bg-blue-500/10 text-blue-500',
  custom: 'bg-muted text-muted-foreground',
};

export default function MessageHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['message-history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_history')
        .select('*')
        .eq('seller_id', user!.id)
        .order('sent_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as MessageHistoryItem[];
    },
    enabled: !!user?.id,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('seller_id', user!.id);
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('message_history').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-history'] });
      toast.success('Mensagem excluída do histórico!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente removido';
  };

  const resendMessage = (message: MessageHistoryItem) => {
    const url = `https://wa.me/${message.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message.message_content)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Mensagens</h1>
        <p className="text-muted-foreground">Veja todas as mensagens enviadas aos clientes</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma mensagem enviada</h3>
            <p className="text-muted-foreground text-center">
              O histórico aparecerá aqui quando você enviar mensagens aos clientes
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <Card key={message.id} className="animate-slide-up">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{getClientName(message.client_id)}</span>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      typeColors[message.message_type] || typeColors.custom
                    )}>
                      {typeLabels[message.message_type] || message.message_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(message.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-3 rounded-lg mb-4 max-h-32 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{message.message_content}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => resendMessage(message)}>
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Reenviar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Excluir esta mensagem do histórico?')) {
                        deleteMutation.mutate(message.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
