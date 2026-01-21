import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PrivacyModeContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  isMoneyHidden: boolean;
  toggleMoneyVisibility: () => void;
  maskData: (data: string | number | null | undefined, type?: 'name' | 'phone' | 'email' | 'money' | 'text') => string;
}

const PrivacyModeContext = createContext<PrivacyModeContextType | undefined>(undefined);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('privacyMode');
    return saved === 'true';
  });

  const [isMoneyHidden, setIsMoneyHidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch hide_revenue preference from database when user logs in
  useEffect(() => {
    const fetchHideRevenue = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('hide_revenue')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setIsMoneyHidden(data.hide_revenue ?? false);
        }
      } catch (err) {
        console.error('Error fetching hide_revenue:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHideRevenue();
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('privacyMode', isPrivacyMode.toString());
  }, [isPrivacyMode]);

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => !prev);
  };

  const toggleMoneyVisibility = useCallback(async () => {
    if (!user?.id) return;

    const newValue = !isMoneyHidden;
    
    // Optimistic update
    setIsMoneyHidden(newValue);

    // Save to database
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ hide_revenue: newValue })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving hide_revenue:', error);
        // Revert on error
        setIsMoneyHidden(!newValue);
      }
    } catch (err) {
      console.error('Error saving hide_revenue:', err);
      setIsMoneyHidden(!newValue);
    }
  }, [user?.id, isMoneyHidden]);

  const maskData = (data: string | number | null | undefined, type: 'name' | 'phone' | 'email' | 'money' | 'text' = 'text'): string => {
    if (data === null || data === undefined) return '';
    
    // Para tipo 'money', verifica isMoneyHidden OU isPrivacyMode
    if (type === 'money' && (isMoneyHidden || isPrivacyMode)) {
      return 'R$ ●●●,●●';
    }
    
    // Para outros tipos, só verifica isPrivacyMode
    if (!isPrivacyMode) return String(data);

    const str = String(data);
    
    switch (type) {
      case 'name':
        return '●●●●●●●●';
      case 'phone':
        return '●●●●●●●●●●●';
      case 'email':
        return '●●●●●@●●●●●.com';
      case 'text':
      default:
        return '●'.repeat(Math.min(str.length, 10));
    }
  };

  return (
    <PrivacyModeContext.Provider value={{ 
      isPrivacyMode, 
      togglePrivacyMode, 
      isMoneyHidden, 
      toggleMoneyVisibility, 
      maskData 
    }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext);
  if (context === undefined) {
    throw new Error('usePrivacyMode must be used within a PrivacyModeProvider');
  }
  return context;
}
