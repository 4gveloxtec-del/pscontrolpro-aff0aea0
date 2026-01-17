import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface QueuedMessage {
  id: string;
  client_id: string;
  client_name: string;
  template_id: string | null;
  message_type: string;
  message_content: string;
  phone: string;
  platform: 'whatsapp' | 'telegram';
  created_at: string;
}

const QUEUE_KEY = 'offline_message_queue';
const QUEUE_SYNC_STATUS_KEY = 'offline_queue_sync_status';

// Helper to show push notification
const showPushNotification = (count: number) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification('Sincronização Concluída', {
        body: `${count} cobrança(s) sincronizada(s) com sucesso!`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'sync-complete',
        requireInteraction: false,
      });

      setTimeout(() => notification.close(), 5000);

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }
};

export function useOfflineQueue() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const hasRequestedPermission = useRef(false);

  // Load queue from localStorage
  const loadQueue = useCallback((): QueuedMessage[] => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed;
      }
    } catch (error) {
      console.error('Error loading offline queue:', error);
    }
    return [];
  }, []);

  // Save queue to localStorage
  const saveQueue = useCallback((items: QueuedMessage[]) => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
      setPendingCount(items.length);
    } catch (error) {
      console.error('Error saving offline queue:', error);
    }
  }, []);

  // Request notification permission
  const requestNotificationPermissionOnAdd = useCallback(() => {
    if (hasRequestedPermission.current) return;
    if ('Notification' in window && Notification.permission === 'default') {
      hasRequestedPermission.current = true;
      Notification.requestPermission();
    }
  }, []);

  // Add message to queue
  const addToQueue = useCallback((message: Omit<QueuedMessage, 'id' | 'created_at'>) => {
    const newMessage: QueuedMessage = {
      ...message,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    const currentQueue = loadQueue();
    const updatedQueue = [...currentQueue, newMessage];
    saveQueue(updatedQueue);
    setQueue(updatedQueue);

    // Request notification permission when first item is added
    requestNotificationPermissionOnAdd();

    toast.success(`Cobrança para ${message.client_name} salva offline`, {
      description: 'Será sincronizada quando voltar online',
    });

    return newMessage;
  }, [loadQueue, saveQueue, requestNotificationPermissionOnAdd]);

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    const currentQueue = loadQueue();
    const updatedQueue = currentQueue.filter(item => item.id !== id);
    saveQueue(updatedQueue);
    setQueue(updatedQueue);
  }, [loadQueue, saveQueue]);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    localStorage.removeItem(QUEUE_KEY);
    setQueue([]);
    setPendingCount(0);
  }, []);

  // Sync single message to server
  const syncMessage = async (message: QueuedMessage): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.from('message_history').insert([{
        seller_id: user.id,
        client_id: message.client_id,
        template_id: message.template_id,
        message_type: message.message_type,
        message_content: message.message_content,
        phone: message.phone,
      }]);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error syncing message:', error);
      return false;
    }
  };

  // Sync all pending messages
  const syncQueue = useCallback(async () => {
    if (!user || !navigator.onLine) return;

    const currentQueue = loadQueue();
    if (currentQueue.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    let failedMessages: QueuedMessage[] = [];

    for (const message of currentQueue) {
      const success = await syncMessage(message);
      if (success) {
        successCount++;
      } else {
        failedMessages.push(message);
      }
    }

    // Update queue with only failed messages
    saveQueue(failedMessages);
    setQueue(failedMessages);

    setIsSyncing(false);

    if (successCount > 0) {
      toast.success(`${successCount} cobrança(s) sincronizada(s)!`);
      // Show push notification
      showPushNotification(successCount);
    }

    if (failedMessages.length > 0) {
      toast.error(`${failedMessages.length} cobrança(s) falharam ao sincronizar`);
    }
  }, [user, loadQueue, saveQueue]);

  // Request notification permission on first queue add
  const requestNotificationPermission = useCallback(() => {
    if (hasRequestedPermission.current) return;
    if ('Notification' in window && Notification.permission === 'default') {
      hasRequestedPermission.current = true;
      Notification.requestPermission();
    }
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      // Sync silently when back online
      syncQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueue]);

  // Initial load
  useEffect(() => {
    const initialQueue = loadQueue();
    setQueue(initialQueue);
    setPendingCount(initialQueue.length);

    // Sync if online and has pending items
    if (navigator.onLine && initialQueue.length > 0) {
      syncQueue();
    }
  }, [loadQueue, syncQueue]);

  return {
    queue,
    pendingCount,
    isSyncing,
    addToQueue,
    removeFromQueue,
    clearQueue,
    syncQueue,
  };
}
