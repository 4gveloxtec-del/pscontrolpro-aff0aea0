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
  welcome_message: `👋 Olá, {primeiro_nome}! Seja bem-vindo(a) à {empresa} 🎬📺

Qualidade, estabilidade e o melhor do entretenimento para você!


Escolha uma opção abaixo 👇

1️⃣ Conhecer os Planos  
2️⃣ Teste Grátis 🎁  
3️⃣ Renovar Assinatura 🫰  
4️⃣ Suporte Técnico 🛠️  
5️⃣ Falar com Atendente 👨‍💻  
6️⃣ PS Control - Revenda ⭐ {NOVIDADE}`,
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
      
      // Buscar config existente para fazer merge correto
      const { data: existing } = await supabase
        .from('bot_engine_config')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle();
      
      // Construir objeto de atualização - apenas campos que existem na tabela
      const updateData = {
        seller_id: user.id,
        is_enabled: updates.is_enabled ?? existing?.is_enabled ?? DEFAULT_CONFIG.is_enabled,
        welcome_message: updates.welcome_message ?? existing?.welcome_message ?? DEFAULT_CONFIG.welcome_message,
        fallback_message: updates.fallback_message ?? existing?.fallback_message ?? DEFAULT_CONFIG.fallback_message,
        inactivity_message: updates.inactivity_message ?? existing?.inactivity_message ?? DEFAULT_CONFIG.inactivity_message,
        outside_hours_message: updates.outside_hours_message ?? existing?.outside_hours_message ?? DEFAULT_CONFIG.outside_hours_message,
        human_takeover_message: updates.human_takeover_message ?? existing?.human_takeover_message ?? DEFAULT_CONFIG.human_takeover_message,
        welcome_cooldown_hours: updates.welcome_cooldown_hours ?? existing?.welcome_cooldown_hours ?? DEFAULT_CONFIG.welcome_cooldown_hours,
        suppress_fallback_first_contact: updates.suppress_fallback_first_contact ?? existing?.suppress_fallback_first_contact ?? DEFAULT_CONFIG.suppress_fallback_first_contact,
        business_hours_enabled: updates.business_hours_enabled ?? existing?.business_hours_enabled ?? DEFAULT_CONFIG.business_hours_enabled,
        business_hours_start: updates.business_hours_start ?? existing?.business_hours_start ?? DEFAULT_CONFIG.business_hours_start,
        business_hours_end: updates.business_hours_end ?? existing?.business_hours_end ?? DEFAULT_CONFIG.business_hours_end,
        business_days: updates.business_days ?? existing?.business_days ?? DEFAULT_CONFIG.business_days,
        timezone: updates.timezone ?? existing?.timezone ?? DEFAULT_CONFIG.timezone,
        typing_simulation: updates.typing_simulation ?? existing?.typing_simulation ?? DEFAULT_CONFIG.typing_simulation,
        human_takeover_enabled: updates.human_takeover_enabled ?? existing?.human_takeover_enabled ?? DEFAULT_CONFIG.human_takeover_enabled,
        max_inactivity_minutes: updates.max_inactivity_minutes ?? existing?.max_inactivity_minutes ?? DEFAULT_CONFIG.max_inactivity_minutes,
        session_expire_minutes: updates.session_expire_minutes ?? existing?.session_expire_minutes ?? DEFAULT_CONFIG.session_expire_minutes,
        auto_reply_delay_ms: updates.auto_reply_delay_ms ?? existing?.auto_reply_delay_ms ?? DEFAULT_CONFIG.auto_reply_delay_ms,
        updated_at: new Date().toISOString(),
      };
      
      console.log('[BotEngine] Saving config:', updateData);
      
      const { data, error } = await supabase
        .from('bot_engine_config')
        .upsert(updateData, {
          onConflict: 'seller_id',
        })
        .select()
        .single();
      
      if (error) {
        console.error('[BotEngine] Upsert error:', error);
        throw error;
      }
      return data as BotEngineConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Configuração salva!');
    },
    onError: (error: any) => {
      console.error('[BotEngine] Config error:', error);
      toast.error('Erro ao salvar: ' + (error.message || 'Erro desconhecido'));
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
