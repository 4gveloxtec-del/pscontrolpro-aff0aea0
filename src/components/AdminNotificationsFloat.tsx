import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, X, ChevronDown, Info, AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  created_at: string;
  expires_at: string | null;
}

export function AdminNotificationsFloat() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  // Don't show for admins - they create notifications, not receive them
  if (isAdmin || !user) return null;

  // Fetch all notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as AdminNotification[];
    },
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch read notification IDs
  const { data: readIds = [] } = useQuery({
    queryKey: ['admin-notification-reads', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notification_reads')
        .select('notification_id')
        .eq('user_id', user!.id);

      if (error) throw error;
      return data.map((r) => r.notification_id);
    },
    enabled: !!user,
  });

  const unreadNotifications = notifications.filter((n) => !readIds.includes(n.id));
  const unreadCount = unreadNotifications.length;

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('admin_notification_reads')
        .insert({
          notification_id: notificationId,
          user_id: user!.id,
        });

      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notification-reads', user?.id] });
    },
  });

  // Mark all as read
  const markAllAsRead = async () => {
    for (const notification of unreadNotifications) {
      await markAsReadMutation.mutateAsync(notification.id);
    }
  };

  // Show animation when new notifications arrive
  useEffect(() => {
    if (unreadCount > 0) {
      setHasNewNotifications(true);
      const timer = setTimeout(() => setHasNewNotifications(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  // Auto-open if there are urgent unread notifications
  useEffect(() => {
    const hasUrgent = unreadNotifications.some((n) => n.type === 'urgent');
    if (hasUrgent && !isOpen) {
      setIsOpen(true);
    }
  }, [unreadNotifications]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent':
        return <AlertOctagon className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case 'urgent':
        return 'bg-destructive/10 border-destructive/30';
      case 'warning':
        return 'bg-warning/10 border-warning/30';
      case 'success':
        return 'bg-green-500/10 border-green-500/30';
      default:
        return 'bg-blue-500/10 border-blue-500/30';
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 md:bottom-6 md:left-6">
      {/* Notification Badge Button */}
      {!isOpen && unreadCount > 0 && (
        <Button
          onClick={() => setIsOpen(true)}
          className={cn(
            "relative h-14 w-14 rounded-full shadow-lg",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            hasNewNotifications && "animate-bounce"
          )}
        >
          <Bell className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
            {unreadCount}
          </span>
          {hasNewNotifications && (
            <span className="absolute -top-1 -right-1 flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            </span>
          )}
        </Button>
      )}

      {/* Notification Panel */}
      {isOpen && (
        <div className="w-80 max-h-[70vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/20 to-primary/10 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Avisos do Sistema</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-xs">{unreadCount}</Badge>
              )}
            </div>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={markAllAsRead}
                >
                  Marcar lidas
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notification List */}
          <ScrollArea className="max-h-[50vh]">
            <div className="p-2 space-y-2">
              {notifications.map((notification) => {
                const isRead = readIds.includes(notification.id);
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-3 rounded-lg border transition-colors cursor-pointer",
                      getTypeBg(notification.type),
                      isRead && "opacity-60"
                    )}
                    onClick={() => !isRead && markAsReadMutation.mutate(notification.id)}
                  >
                    <div className="flex items-start gap-2">
                      {getTypeIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">
                            {notification.title}
                          </p>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
