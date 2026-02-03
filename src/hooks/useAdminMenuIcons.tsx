import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdminMenuIcon {
  id: string;
  menu_key: string;
  icon_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Hook para gerenciar ícones customizados do menu admin
 */
export function useAdminMenuIcons() {
  const queryClient = useQueryClient();

  // Query para buscar todos os ícones
  const { data: menuIcons = [], isLoading, error } = useQuery({
    queryKey: ['admin-menu-icons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_menu_icons')
        .select('*')
        .eq('is_active', true)
        .order('menu_key');

      if (error) {
        console.error('[useAdminMenuIcons] Error fetching icons:', error);
        return [];
      }

      return data as AdminMenuIcon[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation para salvar/atualizar ícone
  const saveMutation = useMutation({
    mutationFn: async ({ menuKey, iconUrl }: { menuKey: string; iconUrl: string }) => {
      // Upsert - insere ou atualiza
      const { data, error } = await supabase
        .from('admin_menu_icons')
        .upsert(
          { 
            menu_key: menuKey, 
            icon_url: iconUrl,
            is_active: true,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'menu_key' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menu-icons'] });
      toast.success('Ícone salvo com sucesso!');
    },
    onError: (error) => {
      console.error('[useAdminMenuIcons] Save error:', error);
      toast.error('Erro ao salvar ícone');
    },
  });

  // Mutation para remover ícone customizado
  const removeMutation = useMutation({
    mutationFn: async (menuKey: string) => {
      const { error } = await supabase
        .from('admin_menu_icons')
        .delete()
        .eq('menu_key', menuKey);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menu-icons'] });
      toast.success('Ícone removido - usando padrão');
    },
    onError: (error) => {
      console.error('[useAdminMenuIcons] Remove error:', error);
      toast.error('Erro ao remover ícone');
    },
  });

  // Helper para obter URL do ícone por menu_key
  const getIconUrl = (menuKey: string): string | null => {
    const icon = menuIcons.find(i => i.menu_key === menuKey);
    return icon?.icon_url || null;
  };

  // Mapa de ícones para fácil acesso
  const iconMap = menuIcons.reduce((acc, icon) => {
    acc[icon.menu_key] = icon.icon_url;
    return acc;
  }, {} as Record<string, string>);

  return {
    menuIcons,
    iconMap,
    isLoading,
    error,
    getIconUrl,
    saveIcon: saveMutation.mutate,
    removeIcon: removeMutation.mutate,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

export default useAdminMenuIcons;
