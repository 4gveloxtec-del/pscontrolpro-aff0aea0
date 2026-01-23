import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, History, MessageCircle, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SentNotification {
  id: string;
  client_id: string;
  notification_type: string;
  expiration_cycle_date: string;
  sent_at: string;
  sent_via: string | null;
  clients: {
    name: string;
    phone: string | null;
  } | null;
}

const NOTIFICATION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  'iptv_vencimento': { label: 'Vencido', emoji: '🔴', color: 'bg-red-500' },
  'iptv_3_dias': { label: '3 dias', emoji: '🟡', color: 'bg-yellow-500' },
  'iptv_2_dias': { label: '2 dias', emoji: '🟠', color: 'bg-orange-500' },
  'iptv_1_dia': { label: '1 dia', emoji: '🔔', color: 'bg-orange-600' },
  'app_vencimento': { label: 'App Vencido', emoji: '🔴', color: 'bg-red-500' },
  'app_3_dias': { label: 'App 3 dias', emoji: '🟡', color: 'bg-yellow-500' },
  'cobranca': { label: 'Cobrança', emoji: '💰', color: 'bg-emerald-500' },
  'renovacao': { label: 'Renovação', emoji: '✅', color: 'bg-green-500' },
  'boas_vindas': { label: 'Boas-vindas', emoji: '🎉', color: 'bg-purple-500' },
};

export function RecentAutoMessages() {
  const { user } = useAuth();

  const { data: recentNotifications = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['recent-auto-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('client_notification_tracking')
        .select(`
          id,
          client_id,
          notification_type,
          expiration_cycle_date,
          sent_at,
          sent_via,
          clients (
            name,
            phone
          )
        `)
        .eq('seller_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching recent notifications:', error);
        return [];
      }

      return (data || []) as unknown as SentNotification[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  const getNotificationInfo = (type: string) => {
    return NOTIFICATION_LABELS[type] || { label: type, emoji: '📨', color: 'bg-gray-500' };
  };

  // Stats
  const todayCount = recentNotifications.filter(n => {
    const sentDate = new Date(n.sent_at);
    const today = new Date();
    return sentDate.toDateString() === today.toDateString();
  }).length;

  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <Bot className="h-5 w-5" />
            Mensagens Automáticas
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Link to="/message-history">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <History className="h-3 w-3" />
                Ver Histórico
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Quick Stats */}
        <div className="flex items-center gap-4 mb-3 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Hoje:</span>
            <Badge variant="secondary" className="text-xs">{todayCount}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">Total:</span>
            <Badge variant="secondary" className="text-xs">{recentNotifications.length}+</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-muted" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recentNotifications.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma mensagem automática enviada ainda</p>
            <p className="text-xs mt-1">
              Configure a automação em{' '}
              <Link to="/whatsapp-automation" className="text-primary hover:underline">
                WhatsApp Automação
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentNotifications.map(notification => {
              const info = getNotificationInfo(notification.notification_type);
              return (
                <div
                  key={notification.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-lg",
                    "bg-gradient-to-br from-white/20 to-transparent",
                    info.color
                  )}>
                    <span className="text-white text-sm">{info.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {notification.clients?.name || 'Cliente'}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {info.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(notification.sent_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </span>
                      {notification.sent_via === 'whatsapp' && (
                        <Badge variant="secondary" className="text-[9px] h-3.5 px-1 gap-0.5">
                          <MessageCircle className="h-2 w-2" />
                          API
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Link to full history */}
            <Link to="/message-history" className="block">
              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs gap-1 text-muted-foreground hover:text-primary">
                <ExternalLink className="h-3 w-3" />
                Ver histórico completo
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
