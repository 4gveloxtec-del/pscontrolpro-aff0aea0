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
  created_at: string;
  updated_at: string;
}

export function useAdminChatbotConfig() {
  const [nodes, setNodes] = useState<ChatbotNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

    // Parse options from JSON
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

    await fetchNodes();
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

    await fetchNodes();
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

    await fetchNodes();
    toast.success('Menu excluído!');
    return { success: true };
  };

  const processUserInput = useCallback((currentNodeKey: string, input: string): { nextNode: ChatbotNode | null; message: string } => {
    const normalizedInput = input.toLowerCase().trim();
    
    // Check for return to main menu
    if (normalizedInput === '*' || normalizedInput === 'voltar' || normalizedInput === 'menu') {
      const inicial = getNodeByKey('inicial');
      return { nextNode: inicial || null, message: inicial?.content || '' };
    }

    const currentNode = getNodeByKey(currentNodeKey);
    if (!currentNode) {
      const inicial = getNodeByKey('inicial');
      return { nextNode: inicial || null, message: inicial?.content || '' };
    }

    // Check input against options
    const inputMappings: Record<string, string> = {
      '1️⃣': '1', 'um': '1', 'one': '1',
      '2️⃣': '2', 'dois': '2', 'two': '2',
      '3️⃣': '3', 'tres': '3', 'três': '3', 'three': '3',
      '4️⃣': '4', 'quatro': '4', 'four': '4',
      '5️⃣': '5', 'cinco': '5', 'five': '5',
      '6️⃣': '6', 'seis': '6', 'six': '6',
      '7️⃣': '7', 'sete': '7', 'seven': '7',
      '8️⃣': '8', 'oito': '8', 'eight': '8',
    };

    let normalizedKey = normalizedInput;
    for (const [key, value] of Object.entries(inputMappings)) {
      if (normalizedInput === key || normalizedInput.includes(key)) {
        normalizedKey = value;
        break;
      }
    }

    // Find matching option
    const matchedOption = currentNode.options.find(opt => opt.key === normalizedKey);
    if (matchedOption) {
      const targetNode = getNodeByKey(matchedOption.target);
      if (targetNode) {
        return { nextNode: targetNode, message: targetNode.content };
      }
    }

    // No valid option found
    return { 
      nextNode: null, 
      message: '❌ Opção inválida. Por favor, escolha uma opção válida ou digite * para voltar ao menu.' 
    };
  }, [getNodeByKey]);

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
