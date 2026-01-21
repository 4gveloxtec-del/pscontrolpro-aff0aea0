import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, startOfToday, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useOnce } from '@/hooks/useOnce';

const LAST_PAYMENT_CHECK_KEY = 'last_payment_notification_check';
const NOTIFICATION_PREF_KEY = 'push_notifications_enabled';

interface ClientWithPayment {
  id: string;
  name: string;
  pending_amount: number;
  expected_payment_date: string;
  phone: string | null;
}

export function usePaymentNotifications() {
  const { user, isSeller } = useAuth();

  const isNotificationsEnabled = useCallback(() => {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
  }, []);

  const showPaymentNotification = useCallback((clients: ClientWithPayment[]) => {
    if (!isNotificationsEnabled()) return;

    const today = startOfToday();
    
    // Clientes com pagamento para hoje
    const paymentToday = clients.filter(c => 
      differenceInDays(new Date(c.expected_payment_date), today) === 0
    );
    
    // Clientes com pagamento atrasado (ontem ou antes)
    const paymentOverdue = clients.filter(c => 
      differenceInDays(new Date(c.expected_payment_date), today) < 0
    );
    
    // Clientes com pagamento amanhã
    const paymentTomorrow = clients.filter(c => 
      differenceInDays(new Date(c.expected_payment_date), today) === 1
    );

    // Prioridade: pagamentos atrasados
    if (paymentOverdue.length > 0) {
      const totalOverdue = paymentOverdue.reduce((sum, c) => sum + c.pending_amount, 0);
      const names = paymentOverdue.slice(0, 3).map(c => c.name).join(', ');
      const extra = paymentOverdue.length > 3 ? ` +${paymentOverdue.length - 3}` : '';
      
      new Notification('💸 Cobranças ATRASADAS!', {
        body: `${paymentOverdue.length} cliente(s): ${names}${extra}\nTotal: R$ ${totalOverdue.toFixed(2)}`,
        icon: '/icon-192.png',
        tag: 'payment-overdue',
        requireInteraction: true,
      });
    }

    // Pagamentos para hoje
    if (paymentToday.length > 0) {
      const totalToday = paymentToday.reduce((sum, c) => sum + c.pending_amount, 0);
      const names = paymentToday.slice(0, 3).map(c => c.name).join(', ');
      const extra = paymentToday.length > 3 ? ` +${paymentToday.length - 3}` : '';
      
      setTimeout(() => {
        new Notification('📅 Cobrar HOJE!', {
          body: `${names}${extra}\nTotal: R$ ${totalToday.toFixed(2)}`,
          icon: '/icon-192.png',
          tag: 'payment-today',
          requireInteraction: true,
        });
      }, paymentOverdue.length > 0 ? 2000 : 0);
    }

    // Pagamentos para amanhã
    if (paymentTomorrow.length > 0 && paymentOverdue.length === 0 && paymentToday.length === 0) {
      const totalTomorrow = paymentTomorrow.reduce((sum, c) => sum + c.pending_amount, 0);
      
      new Notification('Lembrete: Cobranças amanhã', {
        body: `${paymentTomorrow.length} cliente(s) - Total: R$ ${totalTomorrow.toFixed(2)}`,
        icon: '/icon-192.png',
        tag: 'payment-tomorrow',
      });
    }
  }, [isNotificationsEnabled]);

  const checkPayments = useCallback(async () => {
    if (!user?.id || !isSeller) return;
    if (!isNotificationsEnabled()) return;

    // Check if we already notified today
    const lastCheck = localStorage.getItem(LAST_PAYMENT_CHECK_KEY);
    const today = startOfToday().toISOString().split('T')[0];
    
    if (lastCheck === today) return;

    try {
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name, pending_amount, expected_payment_date, phone')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', false)
        .gt('pending_amount', 0)
        .not('expected_payment_date', 'is', null);

      if (error) throw error;

      const todayDate = startOfToday();
      const pendingClients = (clients || []).filter(c => {
        if (!c.expected_payment_date || !c.pending_amount) return false;
        const days = differenceInDays(new Date(c.expected_payment_date), todayDate);
        // Incluir atrasados (negativos), hoje (0), e amanhã (1)
        return days <= 1;
      }) as ClientWithPayment[];

      if (pendingClients.length > 0) {
        showPaymentNotification(pendingClients);
        localStorage.setItem(LAST_PAYMENT_CHECK_KEY, today);
      }
    } catch (error) {
      console.error('Error checking payments:', error);
    }
  }, [user?.id, isSeller, isNotificationsEnabled, showPaymentNotification]);

  // Get clients with pending payments for display in UI
  const getPendingPaymentClients = useCallback(async () => {
    if (!user?.id) return [];

    try {
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name, pending_amount, expected_payment_date, phone')
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .eq('is_paid', false)
        .gt('pending_amount', 0)
        .not('expected_payment_date', 'is', null)
        .order('expected_payment_date', { ascending: true });

      if (error) throw error;
      return clients as ClientWithPayment[];
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      return [];
    }
  }, [user?.id]);

  // Check on mount - runs only once per session
  const initRef = useRef(false);
  useOnce(() => {
    if (!user?.id || !isSeller) return;

    console.log('[usePaymentNotifications] Inicialização única executada');
    initRef.current = true;

    // Initial check after 5 seconds (after expiration notifications)
    const initialTimeout = setTimeout(checkPayments, 5000);

    // Check every hour
    const interval = setInterval(checkPayments, 60 * 60 * 1000);

    return () => {
      console.log('[usePaymentNotifications] Cleanup executado');
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  });

  return {
    checkPayments,
    getPendingPaymentClients,
    isNotificationsEnabled: isNotificationsEnabled(),
  };
}
