import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ChatbotVariable {
  id: string;
  seller_id: string;
  variable_key: string;
  variable_value: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatbotMenuOption {
  key: string;
  label: string;
  target: string;
}

export interface ChatbotMenuNode {
  id: string;
  seller_id: string;
  node_key: string;
  title: string;
  content: string;
  parent_key: string | null;
  options: ChatbotMenuOption[];
  response_type: 'menu' | 'text';
  icon: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatbotKeyword {
  id: string;
  seller_id: string;
  keyword: string;
  response_text: string;
  image_url: string | null;
  is_exact_match: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SellerChatbotSettings {
  id: string;
  seller_id: string;
  menu_enabled: boolean;
  response_mode: string;
  delay_min: number;
  delay_max: number;
  typing_enabled: boolean;
  silent_mode: boolean;
  use_admin_menu: boolean;
  created_at: string;
  updated_at: string;
}

export function useSellerChatbotConfig() {
  const { user } = useAuth();
  const [variables, setVariables] = useState<ChatbotVariable[]>([]);
  const [menuNodes, setMenuNodes] = useState<ChatbotMenuNode[]>([]);
  const [keywords, setKeywords] = useState<ChatbotKeyword[]>([]);
  const [settings, setSettings] = useState<SellerChatbotSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch variables
  const fetchVariables = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('seller_chatbot_variables')
      .select('*')
      .eq('seller_id', user.id)
      .order('is_system', { ascending: false })
      .order('variable_key');

    if (error) {
      console.error('Error fetching variables:', error);
      return;
    }

    setVariables(data || []);
  }, [user]);

  // Fetch menu nodes
  const fetchMenuNodes = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('seller_chatbot_menu')
      .select('*')
      .eq('seller_id', user.id)
      .order('sort_order');

    if (error) {
      console.error('Error fetching menu nodes:', error);
      return;
    }

    const parsedNodes = (data || []).map(node => ({
      ...node,
      options: Array.isArray(node.options) 
        ? (node.options as unknown as ChatbotMenuOption[])
        : []
    })) as ChatbotMenuNode[];

    setMenuNodes(parsedNodes);
  }, [user]);

  // Fetch keywords
  const fetchKeywords = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('seller_chatbot_keywords')
      .select('*')
      .eq('seller_id', user.id)
      .order('keyword');

    if (error) {
      console.error('Error fetching keywords:', error);
      return;
    }

    setKeywords(data || []);
  }, [user]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('seller_chatbot_settings')
      .select('*')
      .eq('seller_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
      return;
    }

    setSettings(data);
  }, [user]);

  // Initialize default variables if needed
  const initializeVariables = useCallback(async () => {
    if (!user) return;

    // Check if variables exist
    const { data: existing } = await supabase
      .from('seller_chatbot_variables')
      .select('id')
      .eq('seller_id', user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      // Get profile data for defaults
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, pix_key, whatsapp')
        .eq('id', user.id)
        .single();

      // Create default variables
      const defaultVars = [
        { seller_id: user.id, variable_key: 'empresa', variable_value: profile?.company_name || '', description: 'Nome da sua empresa/revenda', is_system: true },
        { seller_id: user.id, variable_key: 'pix', variable_value: profile?.pix_key || '', description: 'Chave PIX para pagamentos', is_system: true },
        { seller_id: user.id, variable_key: 'whatsapp', variable_value: profile?.whatsapp || '', description: 'Número de WhatsApp de contato', is_system: true },
        { seller_id: user.id, variable_key: 'horario', variable_value: '08:00 às 22:00', description: 'Horário de atendimento', is_system: true },
        { seller_id: user.id, variable_key: 'suporte', variable_value: '', description: 'Link ou contato de suporte', is_system: false },
        { seller_id: user.id, variable_key: 'site', variable_value: '', description: 'URL do seu site', is_system: false },
        { seller_id: user.id, variable_key: 'instagram', variable_value: '', description: 'Usuário do Instagram', is_system: false },
        { seller_id: user.id, variable_key: 'telegram', variable_value: '', description: 'Link ou usuário do Telegram', is_system: false },
      ];

      await supabase.from('seller_chatbot_variables').insert(defaultVars);
      await fetchVariables();
    }
  }, [user, fetchVariables]);

  // Initialize settings if needed
  const initializeSettings = useCallback(async () => {
    if (!user) return;

    const { data: existing } = await supabase
      .from('seller_chatbot_settings')
      .select('id')
      .eq('seller_id', user.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('seller_chatbot_settings').insert({
        seller_id: user.id,
        menu_enabled: true,  // Enabled by default so chatbot works immediately
        response_mode: '12h',
        delay_min: 2,
        delay_max: 5,
        typing_enabled: true,
        silent_mode: true,
        use_admin_menu: false,  // Start with empty menu, user can copy from admin
      });
      await fetchSettings();
    }
  }, [user, fetchSettings]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setIsLoading(true);
      
      await initializeVariables();
      await initializeSettings();
      await Promise.all([
        fetchVariables(),
        fetchMenuNodes(),
        fetchKeywords(),
        fetchSettings(),
      ]);
      
      setIsLoading(false);
    };

    loadData();
  }, [user, initializeVariables, initializeSettings, fetchVariables, fetchMenuNodes, fetchKeywords, fetchSettings]);

  // CRUD for variables
  const saveVariable = async (variableKey: string, value: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('seller_chatbot_variables')
      .upsert({
        seller_id: user.id,
        variable_key: variableKey,
        variable_value: value,
      }, { onConflict: 'seller_id,variable_key' });

    if (error) {
      toast.error('Erro ao salvar variável');
      return { error };
    }

    await fetchVariables();
    return { success: true };
  };

  const createVariable = async (variableKey: string, value: string, description?: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('seller_chatbot_variables')
      .insert({
        seller_id: user.id,
        variable_key: variableKey.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        variable_value: value,
        description,
        is_system: false,
      });

    if (error) {
      toast.error('Erro ao criar variável: ' + error.message);
      return { error };
    }

    await fetchVariables();
    toast.success('Variável criada!');
    return { success: true };
  };

  const deleteVariable = async (id: string) => {
    const { error } = await supabase
      .from('seller_chatbot_variables')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir variável');
      return { error };
    }

    await fetchVariables();
    toast.success('Variável excluída!');
    return { success: true };
  };

  // CRUD for menu nodes
  const createMenuNode = async (node: Omit<ChatbotMenuNode, 'id' | 'seller_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('seller_chatbot_menu')
      .insert({
        seller_id: user.id,
        ...node,
        options: JSON.parse(JSON.stringify(node.options)),
      });

    if (error) {
      toast.error('Erro ao criar menu: ' + error.message);
      return { error };
    }

    await fetchMenuNodes();
    toast.success('Menu criado!');
    return { success: true };
  };

  const updateMenuNode = async (id: string, updates: Partial<ChatbotMenuNode>) => {
    const updateData: any = { ...updates };
    if (updates.options) {
      updateData.options = JSON.parse(JSON.stringify(updates.options));
    }

    const { error } = await supabase
      .from('seller_chatbot_menu')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar menu');
      return { error };
    }

    await fetchMenuNodes();
    toast.success('Menu atualizado!');
    return { success: true };
  };

  const deleteMenuNode = async (id: string) => {
    const { error } = await supabase
      .from('seller_chatbot_menu')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir menu');
      return { error };
    }

    await fetchMenuNodes();
    toast.success('Menu excluído!');
    return { success: true };
  };

  // CRUD for keywords
  const saveKeyword = async (keyword: Partial<ChatbotKeyword> & { id?: string }) => {
    if (!user) return;

    if (keyword.id) {
      const { error } = await supabase
        .from('seller_chatbot_keywords')
        .update({
          keyword: keyword.keyword,
          response_text: keyword.response_text,
          image_url: keyword.image_url,
          is_exact_match: keyword.is_exact_match,
          is_active: keyword.is_active,
        })
        .eq('id', keyword.id);

      if (error) {
        toast.error('Erro ao atualizar palavra-chave');
        return { error };
      }
    } else {
      const { error } = await supabase
        .from('seller_chatbot_keywords')
        .insert({
          seller_id: user.id,
          keyword: keyword.keyword,
          response_text: keyword.response_text,
          image_url: keyword.image_url,
          is_exact_match: keyword.is_exact_match ?? true,
          is_active: keyword.is_active ?? true,
        });

      if (error) {
        toast.error('Erro ao criar palavra-chave: ' + error.message);
        return { error };
      }
    }

    await fetchKeywords();
    toast.success(keyword.id ? 'Palavra-chave atualizada!' : 'Palavra-chave criada!');
    return { success: true };
  };

  const deleteKeyword = async (id: string) => {
    const { error } = await supabase
      .from('seller_chatbot_keywords')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir palavra-chave');
      return { error };
    }

    await fetchKeywords();
    toast.success('Palavra-chave excluída!');
    return { success: true };
  };

  // Save settings
  const saveSettings = async (newSettings: Partial<SellerChatbotSettings>) => {
    if (!user) return;

    const { error } = await supabase
      .from('seller_chatbot_settings')
      .upsert({
        seller_id: user.id,
        ...newSettings,
      }, { onConflict: 'seller_id' });

    if (error) {
      toast.error('Erro ao salvar configurações');
      return { error };
    }

    await fetchSettings();
    toast.success('Configurações salvas!');
    return { success: true };
  };

  // Copy admin menu to seller
  const copyAdminMenu = async () => {
    if (!user) return;

    // Get admin menu nodes
    const { data: adminNodes, error: fetchError } = await supabase
      .from('admin_chatbot_config')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (fetchError || !adminNodes || adminNodes.length === 0) {
      toast.error('Nenhum menu do ADM encontrado');
      return { error: fetchError?.message || 'No admin menu' };
    }

    // Delete existing seller menu
    await supabase
      .from('seller_chatbot_menu')
      .delete()
      .eq('seller_id', user.id);

    // Copy nodes with seller_id
    const sellerNodes = adminNodes.map(node => ({
      seller_id: user.id,
      node_key: node.node_key,
      title: node.title,
      content: node.content,
      parent_key: node.parent_key,
      options: node.options,
      response_type: node.response_type || 'menu',
      icon: node.icon || '📋',
      sort_order: node.sort_order || 0,
      is_active: true,
      image_url: node.image_url,
    }));

    const { error: insertError } = await supabase
      .from('seller_chatbot_menu')
      .insert(sellerNodes);

    if (insertError) {
      toast.error('Erro ao copiar menu: ' + insertError.message);
      return { error: insertError.message };
    }

    await fetchMenuNodes();
    toast.success('Menu do ADM copiado com sucesso!');
    return { success: true };
  };

  // Get node by key
  const getNodeByKey = useCallback((key: string): ChatbotMenuNode | undefined => {
    return menuNodes.find(n => n.node_key === key);
  }, [menuNodes]);

  // Get child nodes
  const getChildNodes = useCallback((parentKey: string): ChatbotMenuNode[] => {
    return menuNodes.filter(n => n.parent_key === parentKey).sort((a, b) => a.sort_order - b.sort_order);
  }, [menuNodes]);

  // Replace variables in text
  const replaceVariables = useCallback((text: string): string => {
    let result = text;
    for (const variable of variables) {
      const regex = new RegExp(`\\{${variable.variable_key}\\}`, 'gi');
      result = result.replace(regex, variable.variable_value || '');
    }
    return result;
  }, [variables]);

  return {
    variables,
    menuNodes,
    keywords,
    settings,
    isLoading,
    fetchVariables,
    fetchMenuNodes,
    fetchKeywords,
    fetchSettings,
    saveVariable,
    createVariable,
    deleteVariable,
    createMenuNode,
    updateMenuNode,
    deleteMenuNode,
    saveKeyword,
    deleteKeyword,
    saveSettings,
    copyAdminMenu,
    getNodeByKey,
    getChildNodes,
    replaceVariables,
  };
}
