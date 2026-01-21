import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ========== TYPES ==========
export interface ChatbotConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  fallback_message: string;
  welcome_message: string;
  response_delay_min: number;
  response_delay_max: number;
  typing_enabled: boolean;
  ignore_groups: boolean;
  use_list_message: boolean;
  list_button_text: string;
}

export interface ChatbotMenu {
  id: string;
  user_id: string;
  menu_key: string;
  title: string;
  message_text: string;
  image_url: string | null;
  parent_menu_key: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ChatbotOption {
  id: string;
  menu_id: string;
  user_id: string;
  option_number: number;
  option_text: string;
  keywords: string[];
  target_menu_key: string | null;
  action_type: string;
  action_response: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ChatbotTrigger {
  id: string;
  user_id: string;
  trigger_name: string;
  keywords: string[];
  action_type: string;
  target_menu_key: string | null;
  response_text: string | null;
  priority: number;
  is_active: boolean;
}

export interface ChatbotVariable {
  id: string;
  user_id: string;
  variable_key: string;
  variable_value: string;
  description: string | null;
  is_system: boolean;
}

// ========== HOOK ==========
export function useChatbotV3() {
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [menus, setMenus] = useState<ChatbotMenu[]>([]);
  const [options, setOptions] = useState<ChatbotOption[]>([]);
  const [triggers, setTriggers] = useState<ChatbotTrigger[]>([]);
  const [variables, setVariables] = useState<ChatbotVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUserId(user.id);

      const [configRes, menusRes, optionsRes, triggersRes, variablesRes] = await Promise.all([
        supabase.from("chatbot_v3_config").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("chatbot_v3_menus").select("*").eq("user_id", user.id).order("sort_order"),
        supabase.from("chatbot_v3_options").select("*").eq("user_id", user.id).order("sort_order"),
        supabase.from("chatbot_v3_triggers").select("*").eq("user_id", user.id).order("priority", { ascending: false }),
        supabase.from("chatbot_v3_variables").select("*").eq("user_id", user.id),
      ]);

      // Se não tem config, criar padrão
      if (!configRes.data) {
        const { error } = await supabase.rpc("create_default_chatbot_v3", { p_user_id: user.id });
        if (error) {
          console.error("Error creating default chatbot:", error);
        }
        // Refetch
        const [c, m, o, t, v] = await Promise.all([
          supabase.from("chatbot_v3_config").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("chatbot_v3_menus").select("*").eq("user_id", user.id).order("sort_order"),
          supabase.from("chatbot_v3_options").select("*").eq("user_id", user.id).order("sort_order"),
          supabase.from("chatbot_v3_triggers").select("*").eq("user_id", user.id).order("priority", { ascending: false }),
          supabase.from("chatbot_v3_variables").select("*").eq("user_id", user.id),
        ]);
        setConfig(c.data);
        setMenus(m.data || []);
        setOptions(o.data || []);
        setTriggers(t.data || []);
        setVariables(v.data || []);
      } else {
        setConfig(configRes.data);
        setMenus(menusRes.data || []);
        setOptions(optionsRes.data || []);
        setTriggers(triggersRes.data || []);
        setVariables(variablesRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching chatbot data:", error);
      toast.error("Erro ao carregar dados do chatbot");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ========== CONFIG METHODS ==========
  const updateConfig = async (updates: Partial<ChatbotConfig>) => {
    if (!config) return;
    try {
      const { error } = await supabase
        .from("chatbot_v3_config")
        .update(updates)
        .eq("id", config.id);
      
      if (error) throw error;
      setConfig({ ...config, ...updates });
      toast.success("Configurações salvas!");
    } catch (error) {
      console.error("Error updating config:", error);
      toast.error("Erro ao salvar configurações");
    }
  };

  // ========== MENU METHODS ==========
  const createMenu = async (menu: Omit<ChatbotMenu, "id" | "user_id">) => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from("chatbot_v3_menus")
        .insert({ ...menu, user_id: userId })
        .select()
        .single();
      
      if (error) throw error;
      setMenus([...menus, data]);
      toast.success("Menu criado!");
      return data;
    } catch (error: any) {
      console.error("Error creating menu:", error);
      toast.error(error.message || "Erro ao criar menu");
      return null;
    }
  };

  const updateMenu = async (id: string, updates: Partial<ChatbotMenu>) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_menus")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
      setMenus(menus.map(m => m.id === id ? { ...m, ...updates } : m));
      toast.success("Menu atualizado!");
    } catch (error) {
      console.error("Error updating menu:", error);
      toast.error("Erro ao atualizar menu");
    }
  };

  const deleteMenu = async (id: string) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_menus")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      setMenus(menus.filter(m => m.id !== id));
      setOptions(options.filter(o => o.menu_id !== id));
      toast.success("Menu excluído!");
    } catch (error) {
      console.error("Error deleting menu:", error);
      toast.error("Erro ao excluir menu");
    }
  };

  // ========== OPTION METHODS ==========
  const createOption = async (option: Omit<ChatbotOption, "id" | "user_id">) => {
    if (!userId) {
      toast.error("Usuário não autenticado");
      return null;
    }
    try {
      console.log("[ChatbotV3] Creating option:", option);
      const { data, error } = await supabase
        .from("chatbot_v3_options")
        .insert({ ...option, user_id: userId })
        .select()
        .single();
      
      if (error) {
        console.error("[ChatbotV3] Create option error:", error);
        throw error;
      }
      setOptions([...options, data]);
      toast.success("Opção criada!");
      return data;
    } catch (error: any) {
      console.error("Error creating option:", error);
      toast.error(error?.message || "Erro ao criar opção");
      return null;
    }
  };

  const updateOption = async (id: string, updates: Partial<ChatbotOption>) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_options")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
      setOptions(options.map(o => o.id === id ? { ...o, ...updates } : o));
      toast.success("Opção atualizada!");
    } catch (error) {
      console.error("Error updating option:", error);
      toast.error("Erro ao atualizar opção");
    }
  };

  const deleteOption = async (id: string) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_options")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      setOptions(options.filter(o => o.id !== id));
      toast.success("Opção excluída!");
    } catch (error) {
      console.error("Error deleting option:", error);
      toast.error("Erro ao excluir opção");
    }
  };

  // ========== TRIGGER METHODS ==========
  const updateTrigger = async (id: string, updates: Partial<ChatbotTrigger>) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_triggers")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
      setTriggers(triggers.map(t => t.id === id ? { ...t, ...updates } : t));
      toast.success("Gatilho atualizado!");
    } catch (error) {
      console.error("Error updating trigger:", error);
      toast.error("Erro ao atualizar gatilho");
    }
  };

  // ========== VARIABLE METHODS ==========
  const updateVariable = async (id: string, value: string) => {
    try {
      const { error } = await supabase
        .from("chatbot_v3_variables")
        .update({ variable_value: value })
        .eq("id", id);
      
      if (error) throw error;
      setVariables(variables.map(v => v.id === id ? { ...v, variable_value: value } : v));
      toast.success("Variável salva!");
    } catch (error) {
      console.error("Error updating variable:", error);
      toast.error("Erro ao salvar variável");
    }
  };

  // ========== UTILITY ==========
  const getMenuOptions = (menuId: string) => {
    return options.filter(o => o.menu_id === menuId).sort((a, b) => a.option_number - b.option_number);
  };

  const getChildMenus = (parentKey: string | null) => {
    return menus.filter(m => m.parent_menu_key === parentKey).sort((a, b) => a.sort_order - b.sort_order);
  };

  const replaceVariables = (text: string) => {
    if (!text) return text;
    let result = text;
    for (const v of variables) {
      const regex = new RegExp(`\\{${v.variable_key}\\}`, "gi");
      result = result.replace(regex, v.variable_value || `{${v.variable_key}}`);
    }
    return result;
  };

  return {
    config,
    menus,
    options,
    triggers,
    variables,
    isLoading,
    userId,
    // Methods
    fetchData,
    updateConfig,
    createMenu,
    updateMenu,
    deleteMenu,
    createOption,
    updateOption,
    deleteOption,
    updateTrigger,
    updateVariable,
    // Utilities
    getMenuOptions,
    getChildMenus,
    replaceVariables,
  };
}
