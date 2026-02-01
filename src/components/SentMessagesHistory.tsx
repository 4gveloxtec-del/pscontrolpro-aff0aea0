import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCircle2, MessageCircle, Clock, User, Calendar, Search, 
  RefreshCw, Filter, MessageSquare, Smartphone, Send
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SentNotification {
  id: string;
  client_id: string;
  seller_id: string;
  notification_type: string;
  expiration_cycle_date: string;
  sent_at: string;
  sent_via: string | null;
  service_type: string | null;
  clients: {
    name: string;
    phone: string | null;
  } | null;
}

const NOTIFICATION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  'iptv_vencimento': { label: 'Vencido (IPTV)', emoji: '🔴', color: 'bg-red-500' },
  'iptv_3_dias': { label: '3 dias (IPTV)', emoji: '🟡', color: 'bg-yellow-500' },
  'iptv_2_dias': { label: '2 dias (IPTV)', emoji: '🟠', color: 'bg-orange-500' },
  'iptv_1_dia': { label: '1 dia (IPTV)', emoji: '🔔', color: 'bg-orange-600' },
  'app_vencimento': { label: 'Vencido (App)', emoji: '🔴', color: 'bg-red-500' },
  'app_3_dias': { label: '3 dias (App)', emoji: '🟡', color: 'bg-yellow-500' },
  'app_30_dias': { label: '30 dias (App)', emoji: '🔵', color: 'bg-blue-500' },
  'cobranca': { label: 'Cobrança', emoji: '💰', color: 'bg-emerald-500' },
  'payment_overdue_1day': { label: 'Pagamento Atrasado', emoji: '⚠️', color: 'bg-amber-500' },
  'renovacao': { label: 'Renovação', emoji: '✅', color: 'bg-green-500' },
  'boas_vindas': { label: 'Boas-vindas', emoji: '🎉', color: 'bg-purple-500' },
};

const VIA_LABELS: Record<string, { label: string; icon: typeof MessageCircle }> = {
  'whatsapp': { label: 'WhatsApp API', icon: MessageCircle },
  'manual': { label: 'Manual', icon: Smartphone },
  'telegram': { label: 'Telegram', icon: Send },
  'push': { label: 'Push', icon: MessageSquare },
};

export function SentMessagesHistory() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterVia, setFilterVia] = useState<string>('all');

  const { data: notifications, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sent-notifications-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('client_notification_tracking')
        .select(`
          id,
          client_id,
          seller_id,
          notification_type,
          expiration_cycle_date,
          sent_at,
          sent_via,
          service_type,
          clients (
            name,
            phone
          )
        `)
        .eq('seller_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching notifications:', error);
        throw error;
      }

      return (data || []) as unknown as SentNotification[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Error state guard
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-destructive" />
            Mensagens Enviadas
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground mb-4">Erro ao carregar histórico de mensagens</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Filter notifications
  const filteredNotifications = (notifications || []).filter(n => {
    const matchesSearch = !search || 
      n.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      n.clients?.phone?.includes(search);
    
    const matchesType = filterType === 'all' || n.notification_type === filterType;
    const matchesVia = filterVia === 'all' || n.sent_via === filterVia;

    return matchesSearch && matchesType && matchesVia;
  });

  // Stats
  const todayCount = (notifications || []).filter(n => {
    const sentDate = new Date(n.sent_at);
    const today = new Date();
    return sentDate.toDateString() === today.toDateString();
  }).length;

  const whatsappCount = (notifications || []).filter(n => n.sent_via === 'whatsapp').length;

  const getNotificationInfo = (type: string) => {
    return NOTIFICATION_LABELS[type] || { label: type, emoji: '📨', color: 'bg-gray-500' };
  };

  const getViaInfo = (via: string | null) => {
    return VIA_LABELS[via || 'manual'] || VIA_LABELS['manual'];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Mensagens Enviadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-full overflow-hidden">
      <CardHeader className="px-3 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
              <span className="truncate">Mensagens Enviadas</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm truncate">
              Histórico de notificações automáticas
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-primary">{notifications?.length || 0}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Total</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{todayCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Hoje</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{whatsappCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Via API</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full">
                <Filter className="h-4 w-4 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(NOTIFICATION_LABELS).map(([key, { label, emoji }]) => (
                  <SelectItem key={key} value={key}>
                    {emoji} {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterVia} onValueChange={setFilterVia}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Enviado via" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Nenhuma mensagem enviada encontrada</p>
            {search && (
              <Button variant="link" onClick={() => setSearch('')}>
                Limpar busca
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {filteredNotifications.map((notification) => {
                const typeInfo = getNotificationInfo(notification.notification_type);
                const viaInfo = getViaInfo(notification.sent_via);
                const ViaIcon = viaInfo.icon;
                
                return (
                  <div 
                    key={notification.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {/* Client info + Status indicator */}
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${typeInfo.color} mt-1.5 flex-shrink-0`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate text-sm">
                            {notification.clients?.name || 'Cliente removido'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(notification.expiration_cycle_date + 'T12:00:00'), 'dd/MM/yy')}
                          </span>
                          {notification.clients?.phone && (
                            <span className="truncate">{notification.clients.phone}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Badges and time */}
                    <div className="flex items-center gap-2 flex-wrap pl-4 sm:pl-0">
                      <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs">
                        {typeInfo.emoji} {typeInfo.label}
                      </Badge>

                      <Badge 
                        variant={notification.sent_via === 'whatsapp' ? 'default' : 'secondary'}
                        className="shrink-0 text-[10px] sm:text-xs gap-1"
                      >
                        <ViaIcon className="h-3 w-3" />
                        <span className="hidden xs:inline">{viaInfo.label}</span>
                      </Badge>

                      <div className="text-[10px] sm:text-xs text-muted-foreground shrink-0 flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.sent_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
