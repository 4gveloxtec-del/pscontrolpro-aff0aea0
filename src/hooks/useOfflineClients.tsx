import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  expiration_date: string;
  plan_name: string | null;
  plan_price: number | null;
  server_name: string | null;
  login: string | null;
  password: string | null;
  category: string | null;
  is_paid: boolean | null;
  notes: string | null;
  device: string | null;
  telegram: string | null;
}

const CACHE_KEY = 'offline_clients';
const CACHE_TIMESTAMP_KEY = 'offline_clients_timestamp';
const CACHE_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24 hours

export function useOfflineClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Sync silently when back online
      syncClients();
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.warning('Modo offline ativado');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load cached clients
  const loadCachedClients = useCallback((): Client[] => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

      if (cached && timestamp) {
        const parsedTimestamp = parseInt(timestamp, 10);
        setLastSync(new Date(parsedTimestamp));
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error loading cached clients:', error);
    }
    return [];
  }, []);

  // Save clients to cache
  const saveToCache = useCallback((data: Client[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      setLastSync(new Date());
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }, []);

  // Sync clients from server
  const syncClients = useCallback(async () => {
    if (!user || isOffline) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id,
          name,
          phone,
          email,
          expiration_date,
          plan_name,
          plan_price,
          server_name,
          login,
          password,
          category,
          is_paid,
          notes,
          device,
          telegram
        `)
        .eq('seller_id', user.id)
        .eq('is_archived', false)
        .order('expiration_date', { ascending: true });

      if (error) throw error;

      if (data) {
        setClients(data);
        saveToCache(data);
        // Sync silently - no toast notification
      }
    } catch (error) {
      console.error('Error syncing clients:', error);
      // Load from cache if sync fails
      const cached = loadCachedClients();
      setClients(cached);
    } finally {
      setLoading(false);
    }
  }, [user, isOffline, saveToCache, loadCachedClients]);

  // Initial load
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Always load from cache first for instant display
    const cached = loadCachedClients();
    if (cached.length > 0) {
      setClients(cached);
      setLoading(false);
    }

    // Then sync if online
    if (navigator.onLine) {
      syncClients();
    } else {
      setLoading(false);
    }
  }, [user, loadCachedClients]);

  // Search clients (works offline)
  const searchClients = useCallback((query: string): Client[] => {
    if (!query.trim()) return clients;

    const lowerQuery = query.toLowerCase();
    return clients.filter(client =>
      client.name.toLowerCase().includes(lowerQuery) ||
      client.phone?.includes(query) ||
      client.email?.toLowerCase().includes(lowerQuery) ||
      client.login?.toLowerCase().includes(lowerQuery)
    );
  }, [clients]);

  // Get clients expiring soon (works offline)
  const getExpiringClients = useCallback((days: number = 3): Client[] => {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);

    return clients.filter(client => {
      const expDate = new Date(client.expiration_date);
      return expDate >= now && expDate <= futureDate;
    });
  }, [clients]);

  // Get expired clients (works offline)
  const getExpiredClients = useCallback((): Client[] => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return clients.filter(client => {
      const expDate = new Date(client.expiration_date);
      return expDate < now;
    });
  }, [clients]);

  // Clear cache
  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    setClients([]);
    setLastSync(null);
  }, []);

  return {
    clients,
    loading,
    isOffline,
    lastSync,
    syncClients,
    searchClients,
    getExpiringClients,
    getExpiredClients,
    clearCache,
  };
}
