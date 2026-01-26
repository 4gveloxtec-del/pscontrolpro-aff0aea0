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

export function useBotEngineConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar configuração
  const { data: config, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('bot_engine_config')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as BotEngineConfig | null;
    },
    enabled: !!user?.id,
  });

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
  };

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
  };
}
