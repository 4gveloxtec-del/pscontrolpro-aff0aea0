/**
 * BOT ENGINE - Hook para Menus Dinâmicos
 * Gerencia CRUD de menus e submenus do chatbot
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { DynamicMenu, CreateDynamicMenu, UpdateDynamicMenu, DynamicMenuWithChildren } from '@/lib/botEngine/menuTypes';

const QUERY_KEY = 'bot-engine-dynamic-menus';

export function useDynamicMenus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Listar todos os menus (flat)
  const { data: menus = [], isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('bot_engine_dynamic_menus')
        .select('*')
        .eq('seller_id', user.id)
        .order('display_order', { ascending: true })
        .order('title', { ascending: true });
      
      if (error) throw error;
      return data as DynamicMenu[];
    },
    enabled: !!user?.id,
  });

  // Buscar menus filhos de um parent
  const getChildMenus = (parentId: string | null): DynamicMenu[] => {
    return menus.filter(m => m.parent_menu_id === parentId);
  };

  // Buscar menu raiz
  const getRootMenu = (): DynamicMenu | undefined => {
    return menus.find(m => m.is_root);
  };

  // Buscar menu por key
  const getMenuByKey = (key: string): DynamicMenu | undefined => {
    return menus.find(m => m.menu_key === key);
  };

  // Construir árvore de menus
  const buildMenuTree = (parentId: string | null = null): DynamicMenuWithChildren[] => {
    const children = getChildMenus(parentId);
    return children.map(menu => ({
      ...menu,
      children: buildMenuTree(menu.id),
    }));
  };

  // Criar menu
  const createMutation = useMutation({
    mutationFn: async (newMenu: CreateDynamicMenu) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_dynamic_menus')
        .insert({
          ...newMenu,
          seller_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as DynamicMenu;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Menu criado!');
    },
    onError: (error: Error) => {
      console.error('[DynamicMenus] Create error:', error);
      if (error.message.includes('unique_seller_menu_key')) {
        toast.error('Já existe um menu com esta chave');
      } else {
        toast.error('Erro ao criar menu');
      }
    },
  });

  // Atualizar menu
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateDynamicMenu }) => {
      const { data, error } = await supabase
        .from('bot_engine_dynamic_menus')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as DynamicMenu;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Menu atualizado!');
    },
    onError: (error: Error) => {
      console.error('[DynamicMenus] Update error:', error);
      toast.error('Erro ao atualizar menu');
    },
  });

  // Deletar menu
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bot_engine_dynamic_menus')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Menu removido!');
    },
    onError: (error) => {
      console.error('[DynamicMenus] Delete error:', error);
      toast.error('Erro ao remover menu');
    },
  });

  // Reordenar menus
  const reorderMutation = useMutation({
    mutationFn: async (items: { id: string; display_order: number }[]) => {
      const updates = items.map(item => 
        supabase
          .from('bot_engine_dynamic_menus')
          .update({ display_order: item.display_order })
          .eq('id', item.id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Ordem atualizada!');
    },
    onError: (error) => {
      console.error('[DynamicMenus] Reorder error:', error);
      toast.error('Erro ao reordenar');
    },
  });

  // Duplicar menu
  const duplicateMutation = useMutation({
    mutationFn: async (menuId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const original = menus.find(m => m.id === menuId);
      if (!original) throw new Error('Menu não encontrado');
      
      const { data, error } = await supabase
        .from('bot_engine_dynamic_menus')
        .insert({
          seller_id: user.id,
          parent_menu_id: original.parent_menu_id,
          menu_key: `${original.menu_key}_copy_${Date.now()}`,
          title: `${original.title} (cópia)`,
          description: original.description,
          menu_type: original.menu_type,
          target_menu_key: original.target_menu_key,
          target_flow_id: original.target_flow_id,
          target_command: original.target_command,
          target_url: original.target_url,
          target_message: original.target_message,
          emoji: original.emoji,
          section_title: original.section_title,
          display_order: original.display_order + 1,
          is_active: false,
          is_root: false,
          show_back_button: original.show_back_button,
          back_button_text: original.back_button_text,
          header_message: original.header_message,
          footer_message: original.footer_message,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as DynamicMenu;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Menu duplicado!');
    },
    onError: (error) => {
      console.error('[DynamicMenus] Duplicate error:', error);
      toast.error('Erro ao duplicar menu');
    },
  });

  // Toggle ativo
  const toggleActive = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({ id, updates: { is_active: isActive } });
  };

  // Definir como raiz
  const setAsRoot = async (id: string) => {
    if (!user?.id) return;
    
    // Remove root de todos os outros
    const rootMenus = menus.filter(m => m.is_root);
    for (const menu of rootMenus) {
      await supabase
        .from('bot_engine_dynamic_menus')
        .update({ is_root: false })
        .eq('id', menu.id);
    }
    
    // Define este como root
    await updateMutation.mutateAsync({ id, updates: { is_root: true, parent_menu_id: null } });
  };

  // Mover menu para outro parent
  const moveToParent = async (id: string, parentId: string | null) => {
    await updateMutation.mutateAsync({ id, updates: { parent_menu_id: parentId } });
  };

  return {
    menus,
    isLoading,
    error,
    refetch,
    
    // Queries
    getChildMenus,
    getRootMenu,
    getMenuByKey,
    buildMenuTree,
    
    // Mutations
    createMenu: createMutation.mutateAsync,
    updateMenu: updateMutation.mutateAsync,
    deleteMenu: deleteMutation.mutateAsync,
    duplicateMenu: duplicateMutation.mutateAsync,
    reorderMenus: reorderMutation.mutateAsync,
    toggleActive,
    setAsRoot,
    moveToParent,
    
    // States
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
