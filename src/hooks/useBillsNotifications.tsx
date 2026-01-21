import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, startOfToday } from 'date-fns';
import { useOnce } from '@/hooks/useOnce';

const LAST_BILLS_CHECK_KEY = 'last_bills_notification_check';
const NOTIFICATION_PREF_KEY = 'push_notifications_enabled';
const NOTIFICATION_DAYS_KEY = 'notification_days_before';

interface Bill {
  id: string;
  description: string;
  recipient_name: string;
  amount: number;
  due_date: string;
}

export function useBillsNotifications() {
  const { user, isSeller } = useAuth();
  const [notificationDays, setNotificationDays] = useState(3);

  // Load notification days preference
  useEffect(() => {
    const loadDays = async () => {
      // First check localStorage for quick access
      const cachedDays = localStorage.getItem(NOTIFICATION_DAYS_KEY);
      if (cachedDays) {
        setNotificationDays(parseInt(cachedDays, 10));
      }

      // Then load from database
      if (user?.id) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          const profile = data as any;
          if (profile?.notification_days_before !== null && profile?.notification_days_before !== undefined) {
            setNotificationDays(profile.notification_days_before);
            localStorage.setItem(NOTIFICATION_DAYS_KEY, String(profile.notification_days_before));
          }
        } catch (error) {
          console.error('Error loading notification days:', error);
        }
      }
    };

    loadDays();
  }, [user?.id]);

  const isNotificationsEnabled = useCallback(() => {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
  }, []);

  const showBillsNotification = useCallback((bills: Bill[]) => {
    if (!isNotificationsEnabled()) return;

    const today = startOfToday();
    
    // Contas vencidas (ontem ou antes)
    const overdueList = bills.filter(b => 
      differenceInDays(new Date(b.due_date), today) < 0
    );
    
    // Contas para hoje
    const todayList = bills.filter(b => 
      differenceInDays(new Date(b.due_date), today) === 0
    );
    
    // Contas para amanhã
    const tomorrowList = bills.filter(b => 
      differenceInDays(new Date(b.due_date), today) === 1
    );

    // Contas próximas (dentro do período configurado, excluindo hoje e amanhã)
    const upcomingList = bills.filter(b => {
      const days = differenceInDays(new Date(b.due_date), today);
      return days > 1 && days <= notificationDays;
    });

    // Contas vencidas - prioridade máxima
    if (overdueList.length > 0) {
      const totalOverdue = overdueList.reduce((sum, b) => sum + b.amount, 0);
      const descriptions = overdueList.slice(0, 3).map(b => b.description).join(', ');
      const extra = overdueList.length > 3 ? ` +${overdueList.length - 3}` : '';
      
      new Notification('🔴 Contas VENCIDAS!', {
        body: `${overdueList.length} conta(s): ${descriptions}${extra}\nTotal: R$ ${totalOverdue.toFixed(2)}`,
        icon: '/icon-192.png',
        tag: 'bills-overdue',
        requireInteraction: true,
      });
    }

    // Contas para hoje
    if (todayList.length > 0) {
      const totalToday = todayList.reduce((sum, b) => sum + b.amount, 0);
      const descriptions = todayList.slice(0, 3).map(b => b.description).join(', ');
      const extra = todayList.length > 3 ? ` +${todayList.length - 3}` : '';
      
      setTimeout(() => {
        new Notification('📅 Pagar HOJE!', {
          body: `${descriptions}${extra}\nTotal: R$ ${totalToday.toFixed(2)}`,
          icon: '/icon-192.png',
          tag: 'bills-today',
          requireInteraction: true,
        });
      }, overdueList.length > 0 ? 2000 : 0);
    }

    // Contas para amanhã (só mostra se não tiver vencidas nem hoje)
    if (tomorrowList.length > 0 && overdueList.length === 0 && todayList.length === 0) {
      const totalTomorrow = tomorrowList.reduce((sum, b) => sum + b.amount, 0);
      
      new Notification('Lembrete: Contas amanhã', {
        body: `${tomorrowList.length} conta(s) - Total: R$ ${totalTomorrow.toFixed(2)}`,
        icon: '/icon-192.png',
        tag: 'bills-tomorrow',
      });
    }

    // Contas próximas (dentro do período configurado)
    if (upcomingList.length > 0 && overdueList.length === 0 && todayList.length === 0 && tomorrowList.length === 0) {
      const totalUpcoming = upcomingList.reduce((sum, b) => sum + b.amount, 0);
      const descriptions = upcomingList.slice(0, 3).map(b => b.description).join(', ');
      const extra = upcomingList.length > 3 ? ` +${upcomingList.length - 3}` : '';
      
      new Notification(`📅 Contas nos próximos ${notificationDays} dias`, {
        body: `${descriptions}${extra}\nTotal: R$ ${totalUpcoming.toFixed(2)}`,
        icon: '/icon-192.png',
        tag: 'bills-upcoming',
      });
    }
  }, [isNotificationsEnabled, notificationDays]);

  const checkBills = useCallback(async () => {
    if (!user?.id || !isSeller) return;
    if (!isNotificationsEnabled()) return;

    // Verificar se já notificou hoje
    const lastCheck = localStorage.getItem(LAST_BILLS_CHECK_KEY);
    const today = startOfToday().toISOString().split('T')[0];
    
    if (lastCheck === today) return;

    try {
      const { data: bills, error } = await supabase
        .from('bills_to_pay')
        .select('id, description, recipient_name, amount, due_date')
        .eq('seller_id', user.id)
        .eq('is_paid', false)
        .not('due_date', 'is', null);

      if (error) throw error;

      const todayDate = startOfToday();
      const pendingBills = (bills || []).filter(b => {
        if (!b.due_date || !b.amount) return false;
        const days = differenceInDays(new Date(b.due_date), todayDate);
        // Incluir atrasados (negativos) e contas dentro do período configurado
        return days <= notificationDays;
      }) as Bill[];

      if (pendingBills.length > 0) {
        showBillsNotification(pendingBills);
        localStorage.setItem(LAST_BILLS_CHECK_KEY, today);
      }
    } catch (error) {
      console.error('Error checking bills:', error);
    }
  }, [user?.id, isSeller, isNotificationsEnabled, showBillsNotification, notificationDays]);

  // Verificar ao montar - executa apenas uma vez por sessão
  const initRef = useRef(false);
  useOnce(() => {
    if (!user?.id || !isSeller) return;

    console.log('[useBillsNotifications] Inicialização única executada');
    initRef.current = true;

    // Verificação inicial após 7 segundos (depois das outras notificações)
    const initialTimeout = setTimeout(checkBills, 7000);

    // Verificar a cada hora
    const interval = setInterval(checkBills, 60 * 60 * 1000);

    return () => {
      console.log('[useBillsNotifications] Cleanup executado');
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  });

  return {
    checkBills,
    isNotificationsEnabled: isNotificationsEnabled(),
  };
}
