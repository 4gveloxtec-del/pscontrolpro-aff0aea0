import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type ThemeColor = 'netflix' | 'neon-blue' | 'emerald' | 'purple' | 'orange';

const THEME_CACHE_KEY = 'app-theme-cache';

// Função para obter tema cacheado
const getCachedTheme = (): ThemeColor | null => {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    if (cached && ['netflix', 'neon-blue', 'emerald', 'purple', 'orange'].includes(cached)) {
      return cached as ThemeColor;
    }
  } catch {
    // localStorage não disponível
  }
  return null;
};

interface ThemeContextType {
  theme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [localTheme, setLocalTheme] = useState<ThemeColor>(getCachedTheme() || 'netflix');
  
  // Fetch global theme from database
  const { data: globalTheme, isLoading } = useQuery({
    queryKey: ['app-theme'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_theme')
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching theme:', error);
        return getCachedTheme() || 'netflix' as ThemeColor;
      }
      
      return (data?.value as ThemeColor) || getCachedTheme() || 'netflix';
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Mutation to update theme in database
  const updateThemeMutation = useMutation({
    mutationFn: async (newTheme: ThemeColor) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: newTheme })
        .eq('key', 'app_theme');
      
      if (error) throw error;
      return newTheme;
    },
    onSuccess: (newTheme) => {
      queryClient.setQueryData(['app-theme'], newTheme);
      setLocalTheme(newTheme);
    },
  });

  // Set theme when global theme is loaded and cache it
  useEffect(() => {
    if (globalTheme && !isLoading) {
      setLocalTheme(globalTheme);
      try {
        localStorage.setItem(THEME_CACHE_KEY, globalTheme);
      } catch {
        // localStorage não disponível
      }
    }
  }, [globalTheme, isLoading]);

  // Apply theme class to document
  useEffect(() => {
    // Remove all theme classes
    document.documentElement.classList.remove(
      'theme-netflix', 
      'theme-neon-blue', 
      'theme-emerald', 
      'theme-purple', 
      'theme-orange'
    );
    
    // Add current theme class
    document.documentElement.classList.add(`theme-${localTheme}`);
  }, [localTheme]);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('app-theme-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=eq.app_theme'
        },
        (payload) => {
          const newTheme = payload.new.value as ThemeColor;
          setLocalTheme(newTheme);
          queryClient.setQueryData(['app-theme'], newTheme);
          try {
            localStorage.setItem(THEME_CACHE_KEY, newTheme);
          } catch {
            // localStorage não disponível
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const setTheme = (theme: ThemeColor) => {
    setLocalTheme(theme); // Update immediately for responsiveness
    updateThemeMutation.mutate(theme);
  };

  return (
    <ThemeContext.Provider value={{ theme: localTheme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export const themes: { id: ThemeColor; name: string; color: string; description: string; isDark: boolean }[] = [
  { id: 'netflix', name: 'Cinema', color: 'hsl(0, 84%, 50%)', description: 'Escuro cinematográfico', isDark: true },
  { id: 'neon-blue', name: 'Cyberpunk', color: 'hsl(200, 100%, 50%)', description: 'Azul neon futurista', isDark: true },
  { id: 'emerald', name: 'Clean', color: 'hsl(160, 84%, 35%)', description: 'Claro e elegante', isDark: false },
  { id: 'purple', name: 'Luxo', color: 'hsl(280, 80%, 60%)', description: 'Roxo premium', isDark: true },
  { id: 'orange', name: 'Sunset', color: 'hsl(25, 95%, 50%)', description: 'Quente e acolhedor', isDark: false },
];
