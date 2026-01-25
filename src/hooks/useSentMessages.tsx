import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sent_messages_tracker';

interface SentMessage {
  clientId: string;
  sentAt: string;
  templateName?: string;
  templateType?: string;
  platform: 'whatsapp' | 'telegram';
}

export function useSentMessages() {
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);

  // Load from localStorage on mount with corruption protection
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate structure
        if (Array.isArray(parsed)) {
          setSentMessages(parsed);
        } else {
          throw new Error('Invalid cache structure');
        }
      }
    } catch (error) {
      console.error('[useSentMessages] Corrupted cache, resetting:', error);
      localStorage.removeItem(STORAGE_KEY);
      setSentMessages([]);
    }
  }, []);

  // Save to localStorage whenever sentMessages changes - with Safari Private Mode protection
  const saveToStorage = useCallback((messages: SentMessage[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      // Safari Private Mode throws QuotaExceededError
      console.error('[useSentMessages] Error saving to localStorage (possibly Safari Private Mode):', error);
      // Fallback: keep state in memory only, don't crash
    }
  }, []);

  const markAsSent = useCallback((
    clientId: string, 
    templateName?: string, 
    platform: 'whatsapp' | 'telegram' = 'whatsapp',
    templateType?: string
  ) => {
    setSentMessages(prev => {
      // For loyalty/referral templates, we track separately by type
      // So a client can have multiple sent marks for different template types
      let updated: SentMessage[];
      
      if (templateType === 'loyalty' || templateType === 'referral') {
        // Remove existing entry for this client AND this specific type
        const filtered = prev.filter(m => 
          !(m.clientId === clientId && m.templateType === templateType)
        );
        updated = [...filtered, {
          clientId,
          sentAt: new Date().toISOString(),
          templateName,
          templateType,
          platform
        }];
      } else {
        // Default behavior: keep only the latest for this client (general messages)
        const filtered = prev.filter(m => m.clientId !== clientId || m.templateType === 'loyalty' || m.templateType === 'referral');
        updated = [...filtered, {
          clientId,
          sentAt: new Date().toISOString(),
          templateName,
          templateType,
          platform
        }];
      }
      
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const clearSentMark = useCallback((clientId: string, templateType?: string) => {
    setSentMessages(prev => {
      let updated: SentMessage[];
      if (templateType) {
        // Clear only the specific template type for this client
        updated = prev.filter(m => !(m.clientId === clientId && m.templateType === templateType));
      } else {
        // Clear all non-loyalty/referral marks for this client
        updated = prev.filter(m => m.clientId !== clientId || m.templateType === 'loyalty' || m.templateType === 'referral');
      }
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  const clearAllSentMarks = useCallback((templateType?: string) => {
    if (templateType) {
      // Clear only marks for a specific template type
      setSentMessages(prev => {
        const updated = prev.filter(m => m.templateType !== templateType);
        saveToStorage(updated);
        return updated;
      });
    } else {
      // Clear all marks
      setSentMessages([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [saveToStorage]);

  const isSent = useCallback((clientId: string, templateType?: string): boolean => {
    if (templateType) {
      return sentMessages.some(m => m.clientId === clientId && m.templateType === templateType);
    }
    // Check for any non-loyalty/referral message
    return sentMessages.some(m => m.clientId === clientId && m.templateType !== 'loyalty' && m.templateType !== 'referral');
  }, [sentMessages]);

  const getSentInfo = useCallback((clientId: string, templateType?: string): SentMessage | undefined => {
    if (templateType) {
      return sentMessages.find(m => m.clientId === clientId && m.templateType === templateType);
    }
    // Get the most recent non-loyalty/referral message
    return sentMessages.find(m => m.clientId === clientId && m.templateType !== 'loyalty' && m.templateType !== 'referral');
  }, [sentMessages]);

  // Get clients that have been sent a specific template type
  const getClientsSentByType = useCallback((templateType: string): string[] => {
    return sentMessages
      .filter(m => m.templateType === templateType)
      .map(m => m.clientId);
  }, [sentMessages]);

  // Get count of clients sent a specific template type
  const getSentCountByType = useCallback((templateType: string): number => {
    return sentMessages.filter(m => m.templateType === templateType).length;
  }, [sentMessages]);

  const sentCount = sentMessages.filter(m => m.templateType !== 'loyalty' && m.templateType !== 'referral').length;
  const loyaltySentCount = sentMessages.filter(m => m.templateType === 'loyalty').length;
  const referralSentCount = sentMessages.filter(m => m.templateType === 'referral').length;

  return {
    sentMessages,
    markAsSent,
    clearSentMark,
    clearAllSentMarks,
    isSent,
    getSentInfo,
    getClientsSentByType,
    getSentCountByType,
    sentCount,
    loyaltySentCount,
    referralSentCount
  };
}
