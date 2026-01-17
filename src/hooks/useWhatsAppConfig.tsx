import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface WhatsAppConfig {
  api_url: string;
  api_token: string;
  instance_name: string;
  is_connected: boolean;
  auto_send_enabled: boolean;
}

interface NotificationRecord {
  clientId: string;
  notificationType: string;
  expirationDate: string;
  sentAt: string;
}

const STORAGE_KEY_CONFIG = 'whatsapp_api_config';
const STORAGE_KEY_TRACKING = 'whatsapp_notification_tracking';

export function useWhatsAppConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get storage key with user id
  const getStorageKey = useCallback((key: string) => {
    return user?.id ? `${key}_${user.id}` : key;
  }, [user?.id]);

  // Load config from localStorage
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const stored = localStorage.getItem(getStorageKey(STORAGE_KEY_CONFIG));
      if (stored) {
        setConfig(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Error loading WhatsApp config:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, getStorageKey]);

  // Save config to localStorage
  const saveConfig = useCallback((newConfig: WhatsAppConfig) => {
    if (!user?.id) return;
    try {
      localStorage.setItem(getStorageKey(STORAGE_KEY_CONFIG), JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (err) {
      console.error('Error saving WhatsApp config:', err);
    }
  }, [user?.id, getStorageKey]);

  // Get sent notifications from localStorage
  const getSentNotifications = useCallback((): NotificationRecord[] => {
    if (!user?.id) return [];
    try {
      const stored = localStorage.getItem(getStorageKey(STORAGE_KEY_TRACKING));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [user?.id, getStorageKey]);

  // Check if notification was already sent
  const wasNotificationSent = useCallback((
    clientId: string,
    notificationType: string,
    expirationDate: string
  ): boolean => {
    const records = getSentNotifications();
    return records.some(r => 
      r.clientId === clientId &&
      r.notificationType === notificationType &&
      r.expirationDate === expirationDate
    );
  }, [getSentNotifications]);

  // Record that a notification was sent
  const recordNotificationSent = useCallback((
    clientId: string,
    notificationType: string,
    expirationDate: string
  ) => {
    if (!user?.id) return;
    
    const records = getSentNotifications();
    
    // Check if already exists
    const exists = records.some(r => 
      r.clientId === clientId &&
      r.notificationType === notificationType &&
      r.expirationDate === expirationDate
    );
    
    if (!exists) {
      records.push({
        clientId,
        notificationType,
        expirationDate,
        sentAt: new Date().toISOString(),
      });
      
      // Keep only last 1000 records to prevent localStorage bloat
      const trimmed = records.slice(-1000);
      
      try {
        localStorage.setItem(getStorageKey(STORAGE_KEY_TRACKING), JSON.stringify(trimmed));
      } catch (err) {
        console.error('Error saving notification tracking:', err);
      }
    }
  }, [user?.id, getSentNotifications, getStorageKey]);

  // Clear old tracking records (older than 90 days)
  const cleanupOldRecords = useCallback(() => {
    if (!user?.id) return;
    
    const records = getSentNotifications();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const filtered = records.filter(r => new Date(r.sentAt) > cutoffDate);
    
    try {
      localStorage.setItem(getStorageKey(STORAGE_KEY_TRACKING), JSON.stringify(filtered));
    } catch (err) {
      console.error('Error cleaning up records:', err);
    }
  }, [user?.id, getSentNotifications, getStorageKey]);

  // Cleanup on mount
  useEffect(() => {
    cleanupOldRecords();
  }, [cleanupOldRecords]);

  return {
    config,
    isLoading,
    saveConfig,
    wasNotificationSent,
    recordNotificationSent,
    getSentNotifications,
  };
}
