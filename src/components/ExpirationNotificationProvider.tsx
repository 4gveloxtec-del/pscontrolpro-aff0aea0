import { useExpirationNotifications } from '@/hooks/useExpirationNotifications';
import { useExternalAppsExpirationNotifications } from '@/hooks/useExternalAppsExpirationNotifications';
import { usePaymentNotifications } from '@/hooks/usePaymentNotifications';
import { useBillsNotifications } from '@/hooks/useBillsNotifications';

export function ExpirationNotificationProvider({ children }: { children: React.ReactNode }) {
  // These hooks handle all the notification logic internally
  useExpirationNotifications();
  useExternalAppsExpirationNotifications();
  usePaymentNotifications();
  useBillsNotifications();
  
  return <>{children}</>;
}
