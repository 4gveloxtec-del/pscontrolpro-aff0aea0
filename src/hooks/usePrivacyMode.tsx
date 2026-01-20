import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface PrivacyModeContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  isMoneyHidden: boolean;
  toggleMoneyVisibility: () => void;
  maskData: (data: string | number | null | undefined, type?: 'name' | 'phone' | 'email' | 'money' | 'text') => string;
}

const PrivacyModeContext = createContext<PrivacyModeContextType | undefined>(undefined);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    const saved = localStorage.getItem('privacyMode');
    return saved === 'true';
  });

  const [isMoneyHidden, setIsMoneyHidden] = useState(() => {
    const saved = localStorage.getItem('moneyHidden');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('privacyMode', isPrivacyMode.toString());
  }, [isPrivacyMode]);

  useEffect(() => {
    localStorage.setItem('moneyHidden', isMoneyHidden.toString());
  }, [isMoneyHidden]);

  const togglePrivacyMode = () => {
    setIsPrivacyMode(prev => !prev);
  };

  const toggleMoneyVisibility = () => {
    setIsMoneyHidden(prev => !prev);
  };

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
