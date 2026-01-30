import { useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, startOfToday } from 'date-fns';
import { useOnce } from '@/hooks/useOnce';

const LAST_CHECK_KEY = 'last_expiration_notification_check';
const NOTIFICATION_PREF_KEY = 'push_notifications_enabled';

interface Client {
  id: string;
  name: string;
  expiration_date: string;
  billing_mode?: string | null;
}

export function useExpirationNotifications() {
  const { user, isSeller } = useAuth();

  const isNotificationsEnabled = useCallback(() => {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
  }, []);

  const showExpirationNotification = useCallback((clients: Client[]) => {
    if (!isNotificationsEnabled()) return;

    const today = startOfToday();
    
    // AUDIT FIX: Normalize dates to noon to prevent timezone off-by-one errors
    const normalizeDate = (dateStr: string) => {
      const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
      return new Date(normalized);
    };
    
    const expiringToday = clients.filter(c => 
      differenceInDays(normalizeDate(c.expiration_date), today) === 0
    );
    
    const expiringTomorrow = clients.filter(c => 
      differenceInDays(normalizeDate(c.expiration_date), today) === 1
    );
    
    const expiringSoon = clients.filter(c => {
      const days = differenceInDays(normalizeDate(c.expiration_date), today);
      return days >= 2 && days <= 3;
    });

    // Priority notification: clients expiring today
    if (expiringToday.length > 0) {
      const names = expiringToday.slice(0, 3).map(c => c.name).join(', ');
      const extra = expiringToday.length > 3 ? ` +${expiringToday.length - 3}` : '';
      
      new Notification('⚠️ Vencendo HOJE!', {
        body: `${names}${extra}`,
        icon: '/icon-192.png',
        tag: 'expiring-today',
        requireInteraction: true,
      });
    }

    // Secondary: clients expiring tomorrow
    if (expiringTomorrow.length > 0) {
      const names = expiringTomorrow.slice(0, 3).map(c => c.name).join(', ');
      const extra = expiringTomorrow.length > 3 ? ` +${expiringTomorrow.length - 3}` : '';
      
      setTimeout(() => {
        new Notification('Vencendo amanhã', {
          body: `${names}${extra}`,
          icon: '/icon-192.png',
          tag: 'expiring-tomorrow',
        });
      }, 2000);
    }

    // General notification for 2-3 days
    if (expiringSoon.length > 0 && expiringToday.length === 0 && expiringTomorrow.length === 0) {
      new Notification('Clientes prestes a vencer', {
        body: `${expiringSoon.length} cliente(s) vencem em 2-3 dias`,
        icon: '/icon-192.png',
        tag: 'expiring-soon',
      });
    }
  }, [isNotificationsEnabled]);

  const checkExpirations = useCallback(async () => {
    if (!user?.id || !isSeller) return;
    if (!isNotificationsEnabled()) return;

    // Check if we already notified today - with Safari Private Mode protection
    let lastCheck: string | null = null;
    try {
      lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    } catch (e) {
      console.warn('[useExpirationNotifications] localStorage unavailable (possibly Safari Private Mode)');
    }
    const today = startOfToday().toISOString().split('T')[0];
    
    if (lastCheck === today) return;

    try {
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name, expiration_date, billing_mode')
        .eq('seller_id', user.id)
        .eq('is_archived', false);

      if (error) throw error;

      const todayDate = startOfToday();
      // AUDIT FIX: Normalize dates to prevent timezone issues
      const normalizeDate = (dateStr: string) => {
        const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
        return new Date(normalized);
      };
      
      // BILLING MODE: Only notify for clients with manual billing mode (or no mode set)
      const expiringClients = (clients || []).filter(c => {
        // Skip clients with automatic billing mode - they use reminders
        if (c.billing_mode === 'automatic') return false;
        
        const days = differenceInDays(normalizeDate(c.expiration_date), todayDate);
        return days >= 0 && days <= 3;
      });

      if (expiringClients.length > 0) {
        showExpirationNotification(expiringClients);
        try {
          localStorage.setItem(LAST_CHECK_KEY, today);
        } catch (e) {
          console.warn('[useExpirationNotifications] Failed to save to localStorage');
        }
      }
    } catch (error) {
      console.error('Error checking expirations:', error);
    }
  }, [user?.id, isSeller, isNotificationsEnabled, showExpirationNotification]);

  // Check on mount - runs only once per session
  const initRef = useRef(false);
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useOnce(() => {
    if (!user?.id || !isSeller) return;
    
    console.log('[useExpirationNotifications] Inicialização única executada');
    isMountedRef.current = true;
    initRef.current = true;

    // Initial check after 3 seconds
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        checkExpirations();
      }
    }, 3000);

    // Check every hour with unmount check
    intervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      checkExpirations();
    }, 60 * 60 * 1000);

    return () => {
      console.log('[useExpirationNotifications] Cleanup completo executado');
      isMountedRef.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  });

  return {
    checkExpirations,
    isNotificationsEnabled: isNotificationsEnabled(),
  };
}
