import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  History, Trash2, MessageCircle, User, Calendar, Bot, 
  Hand, Search, RefreshCw, Filter, Clock, CheckCircle2,
  Send, Smartphone, MessageSquare
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MessageHistoryItem {
  id: string;
  client_id: string;
  template_id: string | null;
  message_type: string;
  message_content: string;
  sent_at: string;
  phone: string;
}

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

interface Client {
  id: string;
  name: string;
}

const manualTypeLabels: Record<string, string> = {
  welcome: 'Boas-vindas',
  expiring: 'Vencimento Próximo',
  expired: 'Vencido',
  credentials: 'Credenciais',
  billing: 'Cobrança',
  renewal: 'Renovação',
  custom: 'Personalizado',
};

const manualTypeColors: Record<string, string> = {
  welcome: 'bg-success/10 text-success',
  expiring: 'bg-warning/10 text-warning',
  expired: 'bg-destructive/10 text-destructive',
  credentials: 'bg-primary/10 text-primary',
  billing: 'bg-orange-500/10 text-orange-500',
  renewal: 'bg-blue-500/10 text-blue-500',
  custom: 'bg-muted text-muted-foreground',
};

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

export default function MessageHistory() {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Query for manual messages
  const { data: manualMessages = [], isLoading: loadingManual, isError: errorManual, refetch: refetchManual } = useQuery({
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

  // Query for automatic notifications
  const { data: autoNotifications = [], isLoading: loadingAuto, isError: errorAuto, refetch: refetchAuto, isFetching } = useQuery({
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
    refetchInterval: 60000,
  });

  const { data: clients = [], isError: errorClients } = useQuery({
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

  const getNotificationInfo = (type: string) => {
    return NOTIFICATION_LABELS[type] || { label: type, emoji: '📨', color: 'bg-gray-500' };
  };

  const getViaInfo = (via: string | null) => {
    return VIA_LABELS[via || 'manual'] || VIA_LABELS['manual'];
  };

  const handleRefresh = () => {
    refetchManual();
    refetchAuto();
  };

  const isLoading = loadingManual || loadingAuto;
  const hasError = errorManual || errorAuto || errorClients;

  // Error state guard
  if (hasError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            Histórico de Mensagens
          </h1>
        </div>
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground mb-4">Erro ao carregar histórico de mensagens</p>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats
  const todayAutoCount = autoNotifications.filter(n => {
    const sentDate = new Date(n.sent_at);
    const today = new Date();
    return sentDate.toDateString() === today.toDateString();
  }).length;

  const todayManualCount = manualMessages.filter(m => {
    const sentDate = new Date(m.sent_at);
    const today = new Date();
    return sentDate.toDateString() === today.toDateString();
  }).length;

  const whatsappApiCount = autoNotifications.filter(n => n.sent_via === 'whatsapp').length;

  // Filter auto notifications
  const filteredAutoNotifications = autoNotifications.filter(n => {
    const matchesSearch = !search || 
      n.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      n.clients?.phone?.includes(search);
    
    const matchesType = filterType === 'all' || n.notification_type === filterType;

    return matchesSearch && matchesType;
  });

  // Filter manual messages
  const filteredManualMessages = manualMessages.filter(m => {
    const clientName = getClientName(m.client_id);
    const matchesSearch = !search || 
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      m.phone?.includes(search) ||
      m.message_content.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
            <span className="truncate">Histórico de Mensagens</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Todas as mensagens enviadas em um só lugar
          </p>
        </div>
        <Button
          variant="outline" 
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">
              {autoNotifications.length + manualMessages.length}
            </div>
            <div className="text-xs text-muted-foreground">Total Enviadas</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">
              {todayAutoCount + todayManualCount}
            </div>
            <div className="text-xs text-muted-foreground">Hoje</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {autoNotifications.length}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Bot className="h-3 w-3" /> Automáticas
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-600">
              {manualMessages.length}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Hand className="h-3 w-3" /> Manuais
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou conteúdo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all" className="gap-2">
            <History className="h-4 w-4" />
            Todas
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-2">
            <Bot className="h-4 w-4" />
            Automáticas
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Hand className="h-4 w-4" />
            Manuais
          </TabsTrigger>
        </TabsList>

        {/* All Messages Tab */}
        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (filteredAutoNotifications.length === 0 && filteredManualMessages.length === 0) ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma mensagem encontrada</h3>
                <p className="text-muted-foreground text-center">
                  {search ? 'Tente uma busca diferente' : 'O histórico aparecerá aqui quando você enviar mensagens'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-4">
                {/* Combine and sort all messages by date */}
                {[
                  ...filteredAutoNotifications.map(n => ({
                    type: 'auto' as const,
                    data: n,
                    sentAt: new Date(n.sent_at)
                  })),
                  ...filteredManualMessages.map(m => ({
                    type: 'manual' as const,
                    data: m,
                    sentAt: new Date(m.sent_at)
                  }))
                ]
                  .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
                  .slice(0, 100)
                  .map((item, index) => (
                    item.type === 'auto' ? (
                      <AutoMessageCard 
                        key={`auto-${item.data.id}`}
                        notification={item.data as SentNotification}
                        getNotificationInfo={getNotificationInfo}
                        getViaInfo={getViaInfo}
                      />
                    ) : (
                      <ManualMessageCard
                        key={`manual-${item.data.id}`}
                        message={item.data as MessageHistoryItem}
                        getClientName={getClientName}
                        onResend={resendMessage}
                        onDelete={(id) => {
                          confirm({
                            title: 'Excluir mensagem',
                            description: 'Tem certeza que deseja excluir esta mensagem do histórico?',
                            confirmText: 'Excluir',
                            variant: 'destructive',
                            onConfirm: () => deleteMutation.mutate(id),
                          });
                        }}
                      />
                    )
                  ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Auto Messages Tab */}
        <TabsContent value="auto" className="space-y-4">
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Filtrar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(NOTIFICATION_LABELS).map(([key, { label, emoji }]) => (
                  <SelectItem key={key} value={key}>
                    {emoji} {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingAuto ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredAutoNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma mensagem automática</h3>
                <p className="text-muted-foreground text-center">
                  As mensagens automáticas aparecerão aqui quando o sistema enviar
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 pr-4">
                {filteredAutoNotifications.map(notification => (
                  <AutoMessageCard
                    key={notification.id}
                    notification={notification}
                    getNotificationInfo={getNotificationInfo}
                    getViaInfo={getViaInfo}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Manual Messages Tab */}
        <TabsContent value="manual" className="space-y-4">
          {loadingManual ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredManualMessages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Hand className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma mensagem manual</h3>
                <p className="text-muted-foreground text-center">
                  As mensagens manuais aparecerão aqui quando você enviar
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {filteredManualMessages.map((message) => (
                  <ManualMessageCard
                    key={message.id}
                    message={message}
                    getClientName={getClientName}
                    onResend={resendMessage}
                    onDelete={(id) => {
                      confirm({
                        title: 'Excluir mensagem',
                        description: 'Tem certeza que deseja excluir esta mensagem do histórico?',
                        confirmText: 'Excluir',
                        variant: 'destructive',
                        onConfirm: () => deleteMutation.mutate(id),
                      });
                    }}
                    showFullContent
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
      
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// Component for automatic message cards
function AutoMessageCard({ 
  notification, 
  getNotificationInfo, 
  getViaInfo 
}: { 
  notification: SentNotification;
  getNotificationInfo: (type: string) => { label: string; emoji: string; color: string };
  getViaInfo: (via: string | null) => { label: string; icon: typeof MessageCircle };
}) {
  const typeInfo = getNotificationInfo(notification.notification_type);
  const viaInfo = getViaInfo(notification.sent_via);
  const ViaIcon = viaInfo.icon;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-blue-500" />
        <div className={`w-2 h-2 rounded-full ${typeInfo.color}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">
            {notification.clients?.name || 'Cliente removido'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(notification.expiration_cycle_date + 'T12:00:00'), 'dd/MM/yy')}
          </span>
          {notification.clients?.phone && (
            <span>{notification.clients.phone}</span>
          )}
        </div>
      </div>

      <Badge variant="outline" className="shrink-0 text-xs hidden sm:flex">
        {typeInfo.emoji} {typeInfo.label}
      </Badge>

      <Badge 
        variant={notification.sent_via === 'whatsapp' ? 'default' : 'secondary'}
        className="shrink-0 text-xs gap-1"
      >
        <ViaIcon className="h-3 w-3" />
        <span className="hidden sm:inline">{viaInfo.label}</span>
      </Badge>

      <div className="text-xs text-muted-foreground shrink-0 text-right min-w-[60px]">
        <div className="flex items-center gap-1 justify-end">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(notification.sent_at), { 
            addSuffix: true, 
            locale: ptBR 
          })}
        </div>
      </div>
    </div>
  );
}

// Component for manual message cards
function ManualMessageCard({ 
  message, 
  getClientName, 
  onResend, 
  onDelete,
  showFullContent = false
}: { 
  message: MessageHistoryItem;
  getClientName: (id: string) => string;
  onResend: (message: MessageHistoryItem) => void;
  onDelete: (id: string) => void;
  showFullContent?: boolean;
}) {
  const typeColor = manualTypeColors[message.message_type] || manualTypeColors.custom;
  const typeLabel = manualTypeLabels[message.message_type] || message.message_type;

  if (showFullContent) {
    return (
      <Card className="animate-slide-up">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Hand className="h-4 w-4 text-purple-500" />
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{getClientName(message.client_id)}</span>
              </div>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                typeColor
              )}>
                {typeLabel}
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
            <Button variant="outline" size="sm" onClick={() => onResend(message)}>
              <MessageCircle className="h-4 w-4 mr-1" />
              Reenviar
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        <Hand className="h-4 w-4 text-purple-500" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">
            {getClientName(message.client_id)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          {message.message_content}
        </p>
      </div>

      <Badge variant="outline" className={cn("shrink-0 text-xs hidden sm:flex", typeColor)}>
        {typeLabel}
      </Badge>

      <div className="text-xs text-muted-foreground shrink-0 text-right min-w-[60px]">
        <div className="flex items-center gap-1 justify-end">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(message.sent_at), { 
            addSuffix: true, 
            locale: ptBR 
          })}
        </div>
      </div>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 shrink-0"
        onClick={() => onResend(message)}
      >
        <MessageCircle className="h-4 w-4" />
      </Button>
    </div>
  );
}