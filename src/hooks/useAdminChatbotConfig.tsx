import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatbotOption {
  key: string;
  label: string;
  target: string;
}

export interface ChatbotNode {
  id: string;
  node_key: string;
  title: string;
  content: string;
  parent_key: string | null;
  options: ChatbotOption[];
  response_type: 'menu' | 'text';
  icon: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdminChatbotConfig() {
  const [nodes, setNodes] = useState<ChatbotNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Silent refresh - doesn't trigger loading state (prevents page flicker after save)
  const refreshNodes = useCallback(async () => {
    const { data, error } = await supabase
      .from('admin_chatbot_config')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Error refreshing chatbot config:', error);
      return;
    }

    const parsedNodes = (data || []).map(node => ({
      ...node,
      options: Array.isArray(node.options) 
        ? (node.options as unknown as ChatbotOption[])
        : []
    })) as ChatbotNode[];

    setNodes(parsedNodes);
  }, []);

  // Initial load with loading state
  const fetchNodes = useCallback(async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('admin_chatbot_config')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Error fetching chatbot config:', error);
      toast.error('Erro ao carregar configuração do chatbot');
      setIsLoading(false);
      return;
    }

    const parsedNodes = (data || []).map(node => ({
      ...node,
      options: Array.isArray(node.options) 
        ? (node.options as unknown as ChatbotOption[])
        : []
    })) as ChatbotNode[];

    setNodes(parsedNodes);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const getNodeByKey = useCallback((key: string): ChatbotNode | undefined => {
    return nodes.find(n => n.node_key === key);
  }, [nodes]);

  const getChildNodes = useCallback((parentKey: string): ChatbotNode[] => {
    return nodes.filter(n => n.parent_key === parentKey).sort((a, b) => a.sort_order - b.sort_order);
  }, [nodes]);

  const createNode = async (node: Omit<ChatbotNode, 'id' | 'created_at' | 'updated_at'>) => {
    const insertData = {
      node_key: node.node_key,
      title: node.title,
      content: node.content,
      parent_key: node.parent_key,
      options: JSON.parse(JSON.stringify(node.options)),
      response_type: node.response_type,
      icon: node.icon,
      sort_order: node.sort_order,
      is_active: node.is_active
    };

    const { data, error } = await supabase
      .from('admin_chatbot_config')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar menu: ' + error.message);
      return { error: error.message };
    }

    // Use silent refresh to avoid page reload/flicker
    await refreshNodes();
    toast.success('Menu criado com sucesso!');
    return { data };
  };

  const updateNode = async (id: string, updates: Partial<ChatbotNode>) => {
    const updateData = {
      title: updates.title,
      content: updates.content,
      parent_key: updates.parent_key,
      options: updates.options ? JSON.parse(JSON.stringify(updates.options)) : undefined,
      response_type: updates.response_type,
      icon: updates.icon,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    };

    const { error } = await supabase
      .from('admin_chatbot_config')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar menu: ' + error.message);
      return { error: error.message };
    }

    // Use silent refresh to avoid page reload/flicker
    await refreshNodes();
    toast.success('Menu atualizado!');
    return { success: true };
  };

  const deleteNode = async (id: string) => {
    const { error } = await supabase
      .from('admin_chatbot_config')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir menu: ' + error.message);
      return { error: error.message };
    }

    // Use silent refresh to avoid page reload/flicker
    await refreshNodes();
    toast.success('Menu excluído!');
    return { success: true };
  };

  const processUserInput = useCallback((currentNodeKey: string, input: string): { nextNode: ChatbotNode | null; message: string } => {
    // Guard against empty nodes - prevent potential issues
    if (!nodes || nodes.length === 0) {
      return { nextNode: null, message: '' };
    }

    const normalizedInput = input.toLowerCase().trim();
    
    // Guard against empty input
    if (!normalizedInput) {
      return { nextNode: null, message: '' };
    }
    
    // Check for return to main menu - EXPANDED with more synonyms
    const menuCommands = ['*', 'voltar', 'menu', '0', 'inicio', 'início', 'começar', 'reiniciar', '#'];
    if (menuCommands.includes(normalizedInput)) {
      const inicial = getNodeByKey('inicial');
      return { nextNode: inicial || null, message: inicial?.content || '' };
    }

    const currentNode = getNodeByKey(currentNodeKey);
    if (!currentNode) {
      const inicial = getNodeByKey('inicial');
      return { nextNode: inicial || null, message: inicial?.content || '' };
    }

    // Input mappings for emoji numbers and text - EXPANDED
    const inputMappings: Record<string, string> = {
      // Emoji numbers
      '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4', '5️⃣': '5',
      '6️⃣': '6', '7️⃣': '7', '8️⃣': '8', '9️⃣': '9', '0️⃣': '0',
      // Portuguese text numbers
      'um': '1', 'dois': '2', 'tres': '3', 'três': '3', 'quatro': '4',
      'cinco': '5', 'seis': '6', 'sete': '7', 'oito': '8', 'nove': '9', 'zero': '0',
      // English text numbers
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    };

    let normalizedKey = normalizedInput;
    for (const [key, value] of Object.entries(inputMappings)) {
      if (normalizedInput === key || normalizedInput.includes(key)) {
        normalizedKey = value;
        break;
      }
    }

    // Also extract just the first digit if message starts with a number
    if (!/^[0-9]+$/.test(normalizedKey)) {
      const digitMatch = normalizedInput.match(/^([0-9]+)/);
      if (digitMatch) {
        normalizedKey = digitMatch[1];
      }
    }

    // Guard against undefined options array
    const options = currentNode.options || [];
    
    // Find matching option - with null/undefined target guard
    const matchedOption = options.find(opt => opt.key === normalizedKey);
    if (matchedOption && matchedOption.target) {
      const targetNode = getNodeByKey(matchedOption.target);
      if (targetNode) {
        return { nextNode: targetNode, message: targetNode.content };
      }
    }

    // No valid option found - return null to indicate silence (no response)
    return { 
      nextNode: null, 
      message: '' 
    };
  }, [nodes, getNodeByKey]);

  return {
    nodes,
    isLoading,
    fetchNodes,
    getNodeByKey,
    getChildNodes,
    createNode,
    updateNode,
    deleteNode,
    processUserInput
  };
}
