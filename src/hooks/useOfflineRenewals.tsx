import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addDays, addMonths, format } from 'date-fns';

export interface OfflineRenewal {
  id: string;
  clientId: string;
  clientName: string;
  newExpirationDate: string;
  planId: string | null;
  planName: string | null;
  planPrice: number | null;
  createdAt: string;
}

const STORAGE_KEY = 'offline_renewals_queue';

export function useOfflineRenewals() {
  const [pendingRenewals, setPendingRenewals] = useState<OfflineRenewal[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPendingRenewals(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save to localStorage
  const saveToStorage = useCallback((renewals: OfflineRenewal[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(renewals));
    setPendingRenewals(renewals);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto sync when back online
      syncRenewals();
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Add renewal to queue
  const addRenewal = useCallback((renewal: Omit<OfflineRenewal, 'id' | 'createdAt'>) => {
    const newRenewal: OfflineRenewal = {
      ...renewal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const updated = [...pendingRenewals, newRenewal];
    saveToStorage(updated);
    
    toast.success(`Renovação de ${renewal.clientName} salva offline`, {
      description: 'Será sincronizada quando voltar online'
    });

    return newRenewal;
  }, [pendingRenewals, saveToStorage]);

  // Remove renewal from queue
  const removeRenewal = useCallback((id: string) => {
    const updated = pendingRenewals.filter(r => r.id !== id);
    saveToStorage(updated);
  }, [pendingRenewals, saveToStorage]);

  // Sync all pending renewals
  const syncRenewals = useCallback(async () => {
    if (!navigator.onLine || pendingRenewals.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    const failedRenewals: OfflineRenewal[] = [];

    for (const renewal of pendingRenewals) {
      try {
        const { error } = await supabase
          .from('clients')
          .update({
            expiration_date: renewal.newExpirationDate,
            plan_id: renewal.planId,
            plan_name: renewal.planName,
            plan_price: renewal.planPrice,
            renewed_at: new Date().toISOString(),
            is_paid: true,
          })
          .eq('id', renewal.clientId);

        if (error) {
          console.error('Erro ao sincronizar renovação:', error);
          failedRenewals.push(renewal);
        } else {
          successCount++;
        }
      } catch (err) {
        console.error('Erro de rede:', err);
        failedRenewals.push(renewal);
      }
    }

    saveToStorage(failedRenewals);
    setIsSyncing(false);

    if (successCount > 0) {
      toast.success(`${successCount} renovação(ões) sincronizada(s)!`);
      
      // Show push notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Renovações Sincronizadas', {
          body: `${successCount} renovação(ões) sincronizada(s) com sucesso!`,
          icon: '/icon-192.png',
          tag: 'renewal-sync'
        });
      }
    }

    if (failedRenewals.length > 0) {
      toast.error(`${failedRenewals.length} renovação(ões) falharam`, {
        description: 'Serão tentadas novamente'
      });
    }

    return { successCount, failedCount: failedRenewals.length };
  }, [pendingRenewals, saveToStorage]);

  // Clear all pending renewals
  const clearQueue = useCallback(() => {
    saveToStorage([]);
    toast.success('Fila de renovações limpa');
  }, [saveToStorage]);

  // Calculate new expiration date based on plan
  const calculateNewExpiration = useCallback((currentExpiration: string, durationDays: number) => {
    const current = new Date(currentExpiration);
    const today = new Date();
    
    // If already expired, start from today
    const baseDate = current < today ? today : current;
    
    return format(addDays(baseDate, durationDays), 'yyyy-MM-dd');
  }, []);

  return {
    pendingRenewals,
    pendingCount: pendingRenewals.length,
    isOnline,
    isSyncing,
    addRenewal,
    removeRenewal,
    syncRenewals,
    clearQueue,
    calculateNewExpiration,
  };
}
