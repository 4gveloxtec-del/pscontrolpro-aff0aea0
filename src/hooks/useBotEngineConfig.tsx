/**
 * BOT ENGINE - Hook de Configuração
 * Gerencia configurações do motor de chatbot
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { BotEngineConfig } from '@/lib/botEngine/types';

const QUERY_KEY = 'bot-engine-config';
const FLOW_FIRST_MESSAGE_KEY = 'bot-engine-first-message';

// Valores padrão garantidos para toda nova configuração
// Mensagem padrão com menu de opções para boas-vindas
const DEFAULT_CONFIG = {
  welcome_message: `Olá! 👋 Seja bem-vindo!

Escolha uma opção:
1️⃣ Testar IPTV
2️⃣ Ver Planos
3️⃣ Suporte`,
  fallback_message: 'Desculpe, não entendi. Digite *menu* para ver as opções.',
  inactivity_message: 'Sessão encerrada por inatividade.',
  outside_hours_message: 'No momento estamos fora do horário de atendimento. Retornaremos em breve!',
  human_takeover_message: 'Transferindo para um atendente humano...',
  welcome_cooldown_hours: 24,
  suppress_fallback_first_contact: true,
  business_hours_enabled: false,
  business_hours_start: '08:00',
  business_hours_end: '22:00',
  business_days: [1, 2, 3, 4, 5, 6],
  timezone: 'America/Sao_Paulo',
  typing_simulation: true,
  human_takeover_enabled: true,
  max_inactivity_minutes: 30,
  session_expire_minutes: 60,
  auto_reply_delay_ms: 500,
  is_enabled: true,
};

export function useBotEngineConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar configuração - se não existir, criar automaticamente com defaults
  const { data: config, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data: existing, error: fetchError } = await supabase
        .from('bot_engine_config')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      
      // Se já existe, retornar
      if (existing) return existing as BotEngineConfig;
      
      // Se não existe, criar configuração padrão automaticamente
      console.log('[BotEngine] Creating default config for new user');
      const { data: newConfig, error: insertError } = await supabase
        .from('bot_engine_config')
        .insert({
          seller_id: user.id,
          ...DEFAULT_CONFIG,
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('[BotEngine] Failed to create default config:', insertError);
        throw insertError;
      }
      
      return newConfig as BotEngineConfig;
    },
    enabled: !!user?.id,
  });

  // Buscar primeira mensagem do fluxo ativo (para sincronizar com welcome_message)
  const { data: activeFlowFirstMessage } = useQuery({
    queryKey: [FLOW_FIRST_MESSAGE_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Buscar o fluxo ativo (is_default ou primeiro is_active)
      const { data: activeFlow } = await supabase
        .from('bot_engine_flows')
        .select('id, name')
        .eq('seller_id', user.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('priority', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!activeFlow) return null;
      
      // Buscar nós do fluxo ativo
      const { data: nodes } = await supabase
        .from('bot_engine_nodes')
        .select('id, name, node_type, config, is_entry_point')
        .eq('flow_id', activeFlow.id)
        .order('is_entry_point', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (!nodes || nodes.length === 0) return null;
      
      // Encontrar o entry point ou primeiro nó
      const entryNode = nodes.find(n => n.is_entry_point) || nodes[0];
      
      // Se for um nó de message, retornar o texto
      if (entryNode.node_type === 'message') {
        const config = entryNode.config as Record<string, unknown>;
        return config?.message_text as string || null;
      }
      
      // Se for start, procurar a primeira mensagem conectada
      if (entryNode.node_type === 'start') {
        const { data: edges } = await supabase
          .from('bot_engine_edges')
          .select('target_node_id')
          .eq('source_node_id', entryNode.id)
          .order('priority', { ascending: false })
          .limit(1);
        
        if (edges && edges.length > 0) {
          const nextNode = nodes.find(n => n.id === edges[0].target_node_id);
          if (nextNode?.node_type === 'message') {
            const config = nextNode.config as Record<string, unknown>;
            return config?.message_text as string || null;
          }
        }
      }
      
      // Fallback: procurar primeiro nó de mensagem
      const firstMessageNode = nodes.find(n => n.node_type === 'message');
      if (firstMessageNode) {
        const config = firstMessageNode.config as Record<string, unknown>;
        return config?.message_text as string || null;
      }
      
      return null;
    },
    enabled: !!user?.id,
  });


  // Criar ou atualizar configuração
  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<BotEngineConfig>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_config')
        .upsert({
          seller_id: user.id,
          ...DEFAULT_CONFIG,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'seller_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as BotEngineConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Configuração salva!');
    },
    onError: (error) => {
      console.error('[BotEngine] Config error:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  // Ativar/desativar motor
  const toggleEnabled = async (enabled: boolean) => {
    await upsertMutation.mutateAsync({ is_enabled: enabled });
  };

  return {
    config,
    isLoading,
    error,
    upsertConfig: upsertMutation.mutateAsync,
    toggleEnabled,
    isUpdating: upsertMutation.isPending,
    // Primeira mensagem do fluxo ativo para sincronização
    activeFlowFirstMessage,
  };
}
