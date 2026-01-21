import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { differenceInDays, startOfToday } from 'date-fns';
import { useOnce } from '@/hooks/useOnce';

const LAST_CHECK_KEY = 'last_external_apps_expiration_check';
const NOTIFICATION_PREF_KEY = 'push_notifications_enabled';

interface ExpiringApp {
  id: string;
  expiration_date: string;
  client_name: string;
  app_name: string;
  device_name: string;
}

export function useExternalAppsExpirationNotifications() {
  const { user, isSeller } = useAuth();

  const isNotificationsEnabled = useCallback(() => {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
  }, []);

  const sendPushNotification = useCallback(async (title: string, body: string, tag: string) => {
    if (!user?.id) return;

    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title,
          body,
          tag,
          icon: '/icon-192.png',
        },
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }, [user?.id]);

  const showExpirationNotifications = useCallback(async (apps: ExpiringApp[]) => {
    if (!isNotificationsEnabled()) return;

    const today = startOfToday();
    
    const expiringToday = apps.filter(a => 
      differenceInDays(new Date(a.expiration_date), today) === 0
    );
    
    const expiringIn3Days = apps.filter(a => {
      const days = differenceInDays(new Date(a.expiration_date), today);
      return days > 0 && days <= 3;
    });
    
    const expiringIn7Days = apps.filter(a => {
      const days = differenceInDays(new Date(a.expiration_date), today);
      return days > 3 && days <= 7;
    });

    const expiringIn15Days = apps.filter(a => {
      const days = differenceInDays(new Date(a.expiration_date), today);
      return days > 7 && days <= 15;
    });

    const expiringIn30Days = apps.filter(a => {
      const days = differenceInDays(new Date(a.expiration_date), today);
      return days > 15 && days <= 30;
    });

    // Priority: Apps expiring today
    if (expiringToday.length > 0) {
      const names = expiringToday.slice(0, 2).map(a => `${a.client_name} - ${a.app_name}`).join(', ');
      const extra = expiringToday.length > 2 ? ` +${expiringToday.length - 2}` : '';
      
      // Local notification
      new Notification('⚠️ Apps vencendo HOJE!', {
        body: `${names}${extra}`,
        icon: '/icon-192.png',
        tag: 'external-apps-expiring-today',
        requireInteraction: true,
      });

      // Push notification
      await sendPushNotification(
        '⚠️ Apps vencendo HOJE!',
        `${names}${extra}`,
        'external-apps-expiring-today'
      );
    }

    // Apps expiring in 3 days
    if (expiringIn3Days.length > 0) {
      setTimeout(async () => {
        const names = expiringIn3Days.slice(0, 2).map(a => `${a.client_name} - ${a.app_name}`).join(', ');
        const extra = expiringIn3Days.length > 2 ? ` +${expiringIn3Days.length - 2}` : '';
        
        new Notification('🔔 Apps vencendo em até 3 dias', {
          body: `${names}${extra}`,
          icon: '/icon-192.png',
          tag: 'external-apps-expiring-3days',
        });

        await sendPushNotification(
          '🔔 Apps vencendo em até 3 dias',
          `${names}${extra}`,
          'external-apps-expiring-3days'
        );
      }, 2000);
    }

    // Apps expiring in 7 days
    if (expiringIn7Days.length > 0) {
      setTimeout(async () => {
        new Notification('📅 Apps vencendo em até 7 dias', {
          body: `${expiringIn7Days.length} app(s) vencem esta semana`,
          icon: '/icon-192.png',
          tag: 'external-apps-expiring-7days',
        });

        await sendPushNotification(
          '📅 Apps vencendo em até 7 dias',
          `${expiringIn7Days.length} app(s) vencem esta semana`,
          'external-apps-expiring-7days'
        );
      }, 4000);
    }

    // Apps expiring in 15 days
    const lastWeeklyCheck = localStorage.getItem('last_weekly_apps_check');
    const todayStr = today.toISOString().split('T')[0];
    const daysSinceLastWeekly = lastWeeklyCheck 
      ? differenceInDays(today, new Date(lastWeeklyCheck)) 
      : 7;

    if (expiringIn15Days.length > 0 && daysSinceLastWeekly >= 7) {
      setTimeout(async () => {
        new Notification('📆 Apps vencendo em 15 dias', {
          body: `${expiringIn15Days.length} app(s) vencem nas próximas 2 semanas`,
          icon: '/icon-192.png',
          tag: 'external-apps-expiring-15days',
        });

        await sendPushNotification(
          '📆 Apps vencendo em 15 dias',
          `${expiringIn15Days.length} app(s) vencem nas próximas 2 semanas`,
          'external-apps-expiring-15days'
        );
        
        localStorage.setItem('last_weekly_apps_check', todayStr);
      }, 6000);
    }

    // Apps expiring in 30 days (1 month ahead - weekly notification)
    const lastMonthlyCheck = localStorage.getItem('last_monthly_apps_check');
    const daysSinceLastMonthly = lastMonthlyCheck 
      ? differenceInDays(today, new Date(lastMonthlyCheck)) 
      : 7;

    if (expiringIn30Days.length > 0 && daysSinceLastMonthly >= 7) {
      setTimeout(async () => {
        const names = expiringIn30Days.slice(0, 2).map(a => `${a.client_name} - ${a.app_name}`).join(', ');
        const extra = expiringIn30Days.length > 2 ? ` +${expiringIn30Days.length - 2}` : '';

        new Notification('📅 Apps vencendo em 30 dias', {
          body: `${expiringIn30Days.length} app(s) vencem no próximo mês: ${names}${extra}`,
          icon: '/icon-192.png',
          tag: 'external-apps-expiring-30days',
        });

        await sendPushNotification(
          '📅 Apps vencendo em 30 dias',
          `${expiringIn30Days.length} app(s) vencem no próximo mês: ${names}${extra}`,
          'external-apps-expiring-30days'
        );
        
        localStorage.setItem('last_monthly_apps_check', todayStr);
      }, 8000);
    }
  }, [isNotificationsEnabled, sendPushNotification]);

  const checkExpirations = useCallback(async () => {
    if (!user?.id || !isSeller) return;
    if (!isNotificationsEnabled()) return;

    // Check if we already notified today
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const today = startOfToday().toISOString().split('T')[0];
    
    if (lastCheck === today) return;

    try {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`
          id,
          expiration_date,
          devices,
          email,
          client:clients!client_external_apps_client_id_fkey(name),
          external_app:external_apps!client_external_apps_external_app_id_fkey(name)
        `)
        .eq('seller_id', user.id)
        .not('expiration_date', 'is', null);

      if (error) throw error;

      const todayDate = startOfToday();
      const expiringApps: ExpiringApp[] = (data || [])
        .filter(app => {
          const days = differenceInDays(new Date(app.expiration_date), todayDate);
          return days >= 0 && days <= 30;
        })
        .map(app => ({
          id: app.id,
          expiration_date: app.expiration_date,
          client_name: (app.client as any)?.name || 'Cliente',
          app_name: (app.external_app as any)?.name || 'App',
          device_name: (app.devices as any)?.[0]?.name || app.email || '',
        }));

      if (expiringApps.length > 0) {
        await showExpirationNotifications(expiringApps);
        localStorage.setItem(LAST_CHECK_KEY, today);
      }
    } catch (error) {
      console.error('Error checking external apps expirations:', error);
    }
  }, [user?.id, isSeller, isNotificationsEnabled, showExpirationNotifications]);

  // Check on mount - runs only once per session
  const initRef = useRef(false);
  useOnce(() => {
    if (!user?.id || !isSeller) return;

    console.log('[useExternalAppsExpirationNotifications] Inicialização única executada');
    initRef.current = true;

    // Initial check after 5 seconds (after client expirations)
    const initialTimeout = setTimeout(checkExpirations, 5000);

    // Check every hour
    const interval = setInterval(checkExpirations, 60 * 60 * 1000);

    return () => {
      console.log('[useExternalAppsExpirationNotifications] Cleanup executado');
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  });

  return {
    checkExpirations,
    isNotificationsEnabled: isNotificationsEnabled(),
  };
}
