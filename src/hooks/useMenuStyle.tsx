import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type MenuStyle = 'default' | 'compact' | 'icons-only';

const MENU_STYLE_CACHE_KEY = 'pscontrol-menu-style';

// Get cached menu style from localStorage
const getCachedMenuStyle = (): MenuStyle | null => {
  try {
    const cached = localStorage.getItem(MENU_STYLE_CACHE_KEY);
    if (cached && ['default', 'compact', 'icons-only'].includes(cached)) {
      return cached as MenuStyle;
    }
  } catch {
    // localStorage not available
  }
  return null;
};

interface MenuStyleContextType {
  menuStyle: MenuStyle;
  setMenuStyle: (style: MenuStyle) => void;
  isLoading: boolean;
}

const MenuStyleContext = createContext<MenuStyleContextType | undefined>(undefined);

export function MenuStyleProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [localMenuStyle, setLocalMenuStyle] = useState<MenuStyle>(getCachedMenuStyle() || 'default');

  // Fetch global menu style from database
  const { data: globalMenuStyle, isLoading } = useQuery({
    queryKey: ['app-menu-style'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_menu_style')
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching menu style:', error);
        return getCachedMenuStyle() || 'default' as MenuStyle;
      }
      
      return (data?.value as MenuStyle) || getCachedMenuStyle() || 'default';
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Mutation to update menu style in database
  const updateMenuStyleMutation = useMutation({
    mutationFn: async (newStyle: MenuStyle) => {
      // First check if the setting exists
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'app_menu_style')
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('app_settings')
          .update({ value: newStyle })
          .eq('key', 'app_menu_style');
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('app_settings')
          .insert({ key: 'app_menu_style', value: newStyle, description: 'Global menu style setting' });
        
        if (error) throw error;
      }
      
      return newStyle;
    },
    onSuccess: (newStyle) => {
      queryClient.setQueryData(['app-menu-style'], newStyle);
      setLocalMenuStyle(newStyle);
      try {
        localStorage.setItem(MENU_STYLE_CACHE_KEY, newStyle);
      } catch {
        // localStorage not available
      }
    },
  });

  // Set menu style when global style is loaded and cache it
  useEffect(() => {
    if (globalMenuStyle && !isLoading) {
      setLocalMenuStyle(globalMenuStyle);
      try {
        localStorage.setItem(MENU_STYLE_CACHE_KEY, globalMenuStyle);
      } catch {
        // localStorage not available
      }
    }
  }, [globalMenuStyle, isLoading]);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel('app-menu-style-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=eq.app_menu_style'
        },
        (payload) => {
          const newStyle = (payload.new as { value: string })?.value as MenuStyle;
          if (newStyle && ['default', 'compact', 'icons-only'].includes(newStyle)) {
            setLocalMenuStyle(newStyle);
            queryClient.setQueryData(['app-menu-style'], newStyle);
            try {
              localStorage.setItem(MENU_STYLE_CACHE_KEY, newStyle);
            } catch {
              // localStorage not available
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const setMenuStyle = (style: MenuStyle) => {
    setLocalMenuStyle(style); // Update immediately for responsiveness
    updateMenuStyleMutation.mutate(style);
  };

  return (
    <MenuStyleContext.Provider value={{ menuStyle: localMenuStyle, setMenuStyle, isLoading }}>
      {children}
    </MenuStyleContext.Provider>
  );
}

export function useMenuStyle() {
  const context = useContext(MenuStyleContext);
  if (context === undefined) {
    throw new Error('useMenuStyle must be used within a MenuStyleProvider');
  }
  return context;
}
