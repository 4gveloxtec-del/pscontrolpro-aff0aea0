/**
 * BOT ENGINE - Hook de Nós
 * Gerencia nós (passos) de um fluxo de chatbot
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import type { BotNode, BotEdge, CreateBotNode, UpdateBotNode, CreateBotEdge } from '@/lib/botEngine/types';

const NODES_QUERY_KEY = 'bot-engine-nodes';
const EDGES_QUERY_KEY = 'bot-engine-edges';

export function useBotEngineNodes(flowId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Listar nós do fluxo
  const { data: nodes = [], isLoading: loadingNodes } = useQuery({
    queryKey: [NODES_QUERY_KEY, flowId],
    queryFn: async () => {
      if (!flowId) return [];
      
      const { data, error } = await supabase
        .from('bot_engine_nodes')
        .select('*')
        .eq('flow_id', flowId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as BotNode[];
    },
    enabled: !!flowId,
  });

  // Listar edges do fluxo
  const { data: edges = [], isLoading: loadingEdges } = useQuery({
    queryKey: [EDGES_QUERY_KEY, flowId],
    queryFn: async () => {
      if (!flowId) return [];
      
      const { data, error } = await supabase
        .from('bot_engine_edges')
        .select('*')
        .eq('flow_id', flowId)
        .order('priority', { ascending: false });
      
      if (error) throw error;
      return data as BotEdge[];
    },
    enabled: !!flowId,
  });

  // Criar nó
  const createNodeMutation = useMutation({
    mutationFn: async (newNode: CreateBotNode) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_nodes')
        .insert({
          flow_id: newNode.flow_id,
          seller_id: user.id,
          node_type: newNode.node_type,
          name: newNode.name,
          config: newNode.config as Json,
          position_x: newNode.position_x,
          position_y: newNode.position_y,
          is_entry_point: newNode.is_entry_point,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as BotNode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NODES_QUERY_KEY, flowId] });
    },
    onError: (error) => {
      console.error('[BotEngine] Create node error:', error);
      toast.error('Erro ao criar nó');
    },
  });

  // Atualizar nó
  const updateNodeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateBotNode }) => {
      // Construir objeto de atualização com tipos corretos
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.node_type !== undefined) updateData.node_type = updates.node_type;
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.config !== undefined) updateData.config = updates.config as Json;
      if (updates.position_x !== undefined) updateData.position_x = updates.position_x;
      if (updates.position_y !== undefined) updateData.position_y = updates.position_y;
      if (updates.is_entry_point !== undefined) updateData.is_entry_point = updates.is_entry_point;
      
      const { data, error } = await supabase
        .from('bot_engine_nodes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as BotNode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NODES_QUERY_KEY, flowId] });
    },
    onError: (error) => {
      console.error('[BotEngine] Update node error:', error);
      toast.error('Erro ao atualizar nó');
    },
  });

  // Deletar nó (e suas edges)
  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      const { error } = await supabase
        .from('bot_engine_nodes')
        .delete()
        .eq('id', nodeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NODES_QUERY_KEY, flowId] });
      queryClient.invalidateQueries({ queryKey: [EDGES_QUERY_KEY, flowId] });
    },
    onError: (error) => {
      console.error('[BotEngine] Delete node error:', error);
      toast.error('Erro ao deletar nó');
    },
  });

  // Criar edge
  const createEdgeMutation = useMutation({
    mutationFn: async (newEdge: CreateBotEdge) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_edges')
        .insert({
          ...newEdge,
          seller_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as BotEdge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EDGES_QUERY_KEY, flowId] });
    },
    onError: (error) => {
      console.error('[BotEngine] Create edge error:', error);
      toast.error('Erro ao criar conexão');
    },
  });

  // Deletar edge
  const deleteEdgeMutation = useMutation({
    mutationFn: async (edgeId: string) => {
      const { error } = await supabase
        .from('bot_engine_edges')
        .delete()
        .eq('id', edgeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EDGES_QUERY_KEY, flowId] });
    },
    onError: (error) => {
      console.error('[BotEngine] Delete edge error:', error);
      toast.error('Erro ao remover conexão');
    },
  });

  // Atualizar posições em batch (para drag & drop)
  const updatePositions = async (updates: { id: string; position_x: number; position_y: number }[]) => {
    for (const update of updates) {
      await supabase
        .from('bot_engine_nodes')
        .update({ 
          position_x: update.position_x, 
          position_y: update.position_y,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);
    }
    queryClient.invalidateQueries({ queryKey: [NODES_QUERY_KEY, flowId] });
  };

  // Definir entry point
  const setEntryPoint = async (nodeId: string) => {
    if (!flowId || !user?.id) return;
    
    // Remove entry point de todos
    await supabase
      .from('bot_engine_nodes')
      .update({ is_entry_point: false })
      .eq('flow_id', flowId);
    
    // Define novo entry point
    await updateNodeMutation.mutateAsync({ 
      id: nodeId, 
      updates: { is_entry_point: true } 
    });
  };

  return {
    nodes,
    edges,
    isLoading: loadingNodes || loadingEdges,
    
    // Nós
    createNode: createNodeMutation.mutateAsync,
    updateNode: updateNodeMutation.mutateAsync,
    deleteNode: deleteNodeMutation.mutateAsync,
    updatePositions,
    setEntryPoint,
    
    // Edges
    createEdge: createEdgeMutation.mutateAsync,
    deleteEdge: deleteEdgeMutation.mutateAsync,
    
    // Estados
    isCreatingNode: createNodeMutation.isPending,
    isUpdatingNode: updateNodeMutation.isPending,
    isDeletingNode: deleteNodeMutation.isPending,
  };
}
