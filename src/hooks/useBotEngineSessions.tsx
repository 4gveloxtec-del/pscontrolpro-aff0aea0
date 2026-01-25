/**
 * BOT ENGINE - Hook de Sessões
 * Gerencia sessões ativas de conversa do chatbot
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import type { BotSession, BotSessionStatus } from '@/lib/botEngine/types';

const QUERY_KEY = 'bot-engine-sessions';

interface SessionFilters {
  status?: BotSessionStatus;
  flowId?: string;
  search?: string;
  limit?: number;
}

export function useBotEngineSessions(filters: SessionFilters = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { status, flowId, search, limit = 50 } = filters;

  // Listar sessões
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, user?.id, status, flowId, search, limit],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from('bot_engine_sessions')
        .select('*')
        .eq('seller_id', user.id)
        .order('last_activity_at', { ascending: false })
        .limit(limit);
      
      if (status) {
        query = query.eq('status', status);
      }
      
      if (flowId) {
        query = query.eq('flow_id', flowId);
      }
      
      if (search) {
        query = query.or(`contact_phone.ilike.%${search}%,contact_name.ilike.%${search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as BotSession[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Buscar sessão específica
  const getSession = async (sessionId: string): Promise<BotSession | null> => {
    const { data, error } = await supabase
      .from('bot_engine_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    
    if (error) throw error;
    return data as BotSession | null;
  };

  // Buscar sessão ativa por telefone
  const getActiveSessionByPhone = async (phone: string): Promise<BotSession | null> => {
    if (!user?.id) return null;
    
    const { data, error } = await supabase
      .from('bot_engine_sessions')
      .select('*')
      .eq('seller_id', user.id)
      .eq('contact_phone', phone)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    return data as BotSession | null;
  };

  // Encerrar sessão manualmente
  const endSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('bot_engine_sessions')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Sessão encerrada');
    },
    onError: (error) => {
      console.error('[BotEngine] End session error:', error);
      toast.error('Erro ao encerrar sessão');
    },
  });

  // Pausar sessão
  const pauseSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('bot_engine_sessions')
        .update({
          status: 'paused',
        })
        .eq('id', sessionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Sessão pausada');
    },
    onError: (error) => {
      console.error('[BotEngine] Pause session error:', error);
      toast.error('Erro ao pausar sessão');
    },
  });

  // Retomar sessão pausada
  const resumeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('bot_engine_sessions')
        .update({
          status: 'active',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Sessão retomada');
    },
    onError: (error) => {
      console.error('[BotEngine] Resume session error:', error);
      toast.error('Erro ao retomar sessão');
    },
  });

  // Atualizar variáveis da sessão
  const updateVariables = async (sessionId: string, variables: Record<string, unknown>) => {
    const { error } = await supabase
      .from('bot_engine_sessions')
      .update({
        variables: variables as Json,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  // Limpar sessões expiradas
  const cleanupExpired = async (expireMinutes: number = 60) => {
    if (!user?.id) return;
    
    const expireDate = new Date();
    expireDate.setMinutes(expireDate.getMinutes() - expireMinutes);
    
    const { error } = await supabase
      .from('bot_engine_sessions')
      .update({
        status: 'expired',
        ended_at: new Date().toISOString(),
      })
      .eq('seller_id', user.id)
      .eq('status', 'active')
      .lt('last_activity_at', expireDate.toISOString());
    
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  // Estatísticas rápidas
  const stats = {
    total: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    expired: sessions.filter(s => s.status === 'expired').length,
  };

  return {
    sessions,
    stats,
    isLoading,
    error,
    
    // Operações
    getSession,
    getActiveSessionByPhone,
    endSession: endSessionMutation.mutateAsync,
    pauseSession: pauseSessionMutation.mutateAsync,
    resumeSession: resumeSessionMutation.mutateAsync,
    updateVariables,
    cleanupExpired,
    
    // Estados
    isEnding: endSessionMutation.isPending,
    isPausing: pauseSessionMutation.isPending,
    isResuming: resumeSessionMutation.isPending,
  };
}
