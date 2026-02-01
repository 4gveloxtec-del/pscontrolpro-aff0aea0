/**
 * BOT ENGINE - Hook de Fluxos
 * Gerencia fluxos de conversa do chatbot
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { BotFlow, CreateBotFlow, UpdateBotFlow } from '@/lib/botEngine/types';

const QUERY_KEY = 'bot-engine-flows';

export function useBotEngineFlows() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Listar fluxos
  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('bot_engine_flows')
        .select('*')
        .eq('seller_id', user.id)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BotFlow[];
    },
    enabled: !!user?.id,
  });

  // Criar fluxo
  const createMutation = useMutation({
    mutationFn: async (newFlow: CreateBotFlow) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_flows')
        .insert({
          ...newFlow,
          seller_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as BotFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Fluxo criado!');
    },
    onError: (error) => {
      console.error('[BotEngine] Create flow error:', error);
      toast.error('Erro ao criar fluxo');
    },
  });

  // Atualizar fluxo
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateBotFlow }) => {
      const { data, error } = await supabase
        .from('bot_engine_flows')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as BotFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Fluxo atualizado!');
    },
    onError: (error) => {
      console.error('[BotEngine] Update flow error:', error);
      toast.error('Erro ao atualizar fluxo');
    },
  });

  // Deletar fluxo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bot_engine_flows')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Fluxo removido!');
    },
    onError: (error) => {
      console.error('[BotEngine] Delete flow error:', error);
      toast.error('Erro ao remover fluxo');
    },
  });

  // Duplicar fluxo (também usado para clonar templates)
  const duplicateMutation = useMutation({
    mutationFn: async (flowId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      // Buscar fluxo original
      const { data: original, error: fetchError } = await supabase
        .from('bot_engine_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Verificar se é um template sendo clonado
      const isTemplate = original.is_template === true;
      
      // Criar cópia para o seller atual
      const { data: newFlow, error: insertError } = await supabase
        .from('bot_engine_flows')
        .insert({
          seller_id: user.id,
          name: isTemplate ? original.name : `${original.name} (cópia)`,
          description: original.description,
          trigger_type: original.trigger_type,
          trigger_keywords: original.trigger_keywords,
          category: original.category,
          is_active: false, // Cópia começa desativada
          is_default: false,
          is_template: false, // Cópia nunca é template
          cloned_from_template_id: isTemplate ? flowId : null,
          priority: original.priority,
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      // Duplicar nós do fluxo original
      const { data: originalNodes } = await supabase
        .from('bot_engine_nodes')
        .select('*')
        .eq('flow_id', flowId);
      
      if (originalNodes && originalNodes.length > 0) {
        const nodeIdMap = new Map<string, string>(); // Mapeia ID antigo -> novo
        
        // Criar novos nós
        for (const node of originalNodes) {
          const newNodeId = crypto.randomUUID();
          nodeIdMap.set(node.id, newNodeId);
          
          await supabase.from('bot_engine_nodes').insert({
            id: newNodeId,
            flow_id: newFlow.id,
            seller_id: user.id,
            node_type: node.node_type,
            name: node.name,
            config: node.config,
            position_x: node.position_x,
            position_y: node.position_y,
            is_entry_point: node.is_entry_point,
          });
        }
        
        // Duplicar edges atualizando referências de nós
        const { data: originalEdges } = await supabase
          .from('bot_engine_edges')
          .select('*')
          .eq('flow_id', flowId);
        
        if (originalEdges && originalEdges.length > 0) {
          for (const edge of originalEdges) {
            const newSourceId = nodeIdMap.get(edge.source_node_id);
            const newTargetId = nodeIdMap.get(edge.target_node_id);
            
            if (newSourceId && newTargetId) {
              await supabase.from('bot_engine_edges').insert({
                flow_id: newFlow.id,
                seller_id: user.id,
                source_node_id: newSourceId,
                target_node_id: newTargetId,
                condition_type: edge.condition_type,
                condition_value: edge.condition_value,
                label: edge.label,
                priority: edge.priority,
              });
            }
          }
        }
      }
      
      return newFlow as BotFlow;
    },
    onSuccess: (_, flowId) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Fluxo clonado com sucesso! Agora você pode editá-lo.');
    },
    onError: (error) => {
      console.error('[BotEngine] Duplicate flow error:', error);
      toast.error('Erro ao clonar fluxo');
    },
  });
  
  // Clonar template para uso próprio
  const cloneTemplate = async (templateId: string) => {
    return duplicateMutation.mutateAsync(templateId);
  };

  // Toggle ativo
  const toggleActive = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({ id, updates: { is_active: isActive } });
  };

  // Definir como padrão
  const setAsDefault = async (id: string) => {
    if (!user?.id) return;
    
    // Remove o default de todos os outros
    await supabase
      .from('bot_engine_flows')
      .update({ is_default: false })
      .eq('seller_id', user.id)
      .neq('id', id);
    
    // Define este como default
    await updateMutation.mutateAsync({ id, updates: { is_default: true } });
  };

  return {
    flows,
    isLoading,
    error,
    createFlow: createMutation.mutateAsync,
    updateFlow: updateMutation.mutateAsync,
    deleteFlow: deleteMutation.mutateAsync,
    duplicateFlow: duplicateMutation.mutateAsync,
    cloneTemplate, // Nova função para clonar templates
    toggleActive,
    setAsDefault,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isCloning: duplicateMutation.isPending,
  };
}
