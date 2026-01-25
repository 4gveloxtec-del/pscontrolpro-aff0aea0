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

  // Criar ou atualizar configuração
  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<BotEngineConfig>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { data, error } = await supabase
        .from('bot_engine_config')
        .upsert({
          seller_id: user.id,
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
