/**
 * Circuit Breaker Hook para Evolution API
 * 
 * Gerencia o estado do circuit breaker e fila local de mensagens
 * quando a API WhatsApp está indisponível.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Estados do Circuit Breaker
type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerState {
  id: string;
  seller_id: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  failure_threshold: number;
  success_threshold: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  opened_at: string | null;
  reset_timeout_ms: number;
  last_error: string | null;
}

interface QueuedMessage {
  id: string;
  seller_id: string;
  phone: string;
  message: string;
  message_type: string;
  client_id: string | null;
  config: Record<string, unknown>;
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'expired';
  priority: number;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  expires_at: string;
}

interface SendMessageParams {
  phone: string;
  message: string;
  messageType?: string;
  clientId?: string;
  config: {
    api_url: string;
    api_token: string;
    instance_name: string;
  };
  priority?: number;
}

export function useCircuitBreaker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Fetch circuit breaker state
  const { data: circuitState, refetch: refetchCircuit } = useQuery({
    queryKey: ['circuit-breaker', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Upsert para garantir que existe
      const { data: existing } = await supabase
        .from('evolution_circuit_breaker')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle();
      
      if (existing) return existing as CircuitBreakerState;
      
      // Criar se não existe - AUDIT FIX: Use maybeSingle() instead of single()
      const { data: created, error } = await supabase
        .from('evolution_circuit_breaker')
        .insert({ seller_id: user.id })
        .select('*')
        .maybeSingle();
      
      if (error) throw error;
      if (!created) throw new Error('Falha ao criar circuit breaker');
      return created as CircuitBreakerState;
    },
    enabled: !!user?.id,
    staleTime: 5000,
  });

  // Fetch queued messages
  const { data: queuedMessages = [], refetch: refetchQueue } = useQuery({
    queryKey: ['evolution-queue', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('evolution_message_queue')
        .select('*')
        .eq('seller_id', user.id)
        .in('status', ['queued', 'processing'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return (data || []) as unknown as QueuedMessage[];
    },
    enabled: !!user?.id,
    staleTime: 10000,
  });

  // Check if circuit should transition to half_open
  const shouldTryHalfOpen = useCallback(() => {
    if (!circuitState || circuitState.state !== 'open') return false;
    if (!circuitState.opened_at) return false;
    
    const openedAt = new Date(circuitState.opened_at).getTime();
    const now = Date.now();
    const elapsed = now - openedAt;
    
    return elapsed >= circuitState.reset_timeout_ms;
  }, [circuitState]);

  // Record success
  const recordSuccess = useCallback(async () => {
    if (!user?.id || !circuitState) return;
    
    const newState = { ...circuitState };
    newState.success_count += 1;
    newState.last_success_at = new Date().toISOString();
    newState.failure_count = 0; // Reset failures on success
    
    // Transition from half_open to closed
    if (newState.state === 'half_open' && newState.success_count >= newState.success_threshold) {
      newState.state = 'closed';
      newState.opened_at = null;
      console.log('[CircuitBreaker] Transitioning to CLOSED (recovered)');
    }
    
    await supabase
      .from('evolution_circuit_breaker')
      .update({
        state: newState.state,
        success_count: newState.success_count,
        failure_count: newState.failure_count,
        last_success_at: newState.last_success_at,
        opened_at: newState.opened_at,
      })
      .eq('seller_id', user.id);
    
    refetchCircuit();
  }, [user?.id, circuitState, refetchCircuit]);

  // Record failure
  const recordFailure = useCallback(async (error: string) => {
    if (!user?.id || !circuitState) return;
    
    const newState = { ...circuitState };
    newState.failure_count += 1;
    newState.last_failure_at = new Date().toISOString();
    newState.last_error = error;
    newState.success_count = 0; // Reset successes on failure
    
    // Transition from closed to open
    if (newState.state === 'closed' && newState.failure_count >= newState.failure_threshold) {
      newState.state = 'open';
      newState.opened_at = new Date().toISOString();
      console.log('[CircuitBreaker] Transitioning to OPEN (failures exceeded threshold)');
      toast.warning('API WhatsApp instável. Mensagens serão enfileiradas automaticamente.');
    }
    
    // Transition from half_open back to open
    if (newState.state === 'half_open') {
      newState.state = 'open';
      newState.opened_at = new Date().toISOString();
      console.log('[CircuitBreaker] Transitioning back to OPEN (test failed)');
    }
    
    await supabase
      .from('evolution_circuit_breaker')
      .update({
        state: newState.state,
        failure_count: newState.failure_count,
        success_count: newState.success_count,
        last_failure_at: newState.last_failure_at,
        last_error: newState.last_error,
        opened_at: newState.opened_at,
      })
      .eq('seller_id', user.id);
    
    refetchCircuit();
  }, [user?.id, circuitState, refetchCircuit]);

  // Add message to queue
  const addToQueue = useCallback(async (params: SendMessageParams) => {
    if (!user?.id) return null;
    
    const { data, error } = await supabase
      .from('evolution_message_queue')
      .insert({
        seller_id: user.id,
        phone: params.phone,
        message: params.message,
        message_type: params.messageType || 'manual',
        client_id: params.clientId || null,
        config: {
          api_url: params.config.api_url,
          instance_name: params.config.instance_name,
        },
        priority: params.priority || 0,
        status: 'queued',
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[CircuitBreaker] Failed to queue message:', error);
      return null;
    }
    
    refetchQueue();
    return data.id;
  }, [user?.id, refetchQueue]);

  // Send message with circuit breaker logic
  const sendWithCircuitBreaker = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      // Check circuit state
      const currentState = circuitState?.state || 'closed';
      
      // If open, check if we should try half_open
      if (currentState === 'open') {
        if (shouldTryHalfOpen()) {
          // Transition to half_open and try
          await supabase
            .from('evolution_circuit_breaker')
            .update({ state: 'half_open', success_count: 0 })
            .eq('seller_id', user.id);
          console.log('[CircuitBreaker] Transitioning to HALF_OPEN (testing)');
        } else {
          // Still open, queue the message
          const queueId = await addToQueue(params);
          return { 
            success: false, 
            queued: true, 
            queueId,
            reason: 'Circuit breaker open - message queued' 
          };
        }
      }
      
      // Try to send via Evolution API
      try {
        const { data, error } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'send_message',
            userId: user.id,
            phone: params.phone,
            message: params.message,
            config: params.config,
          },
        });
        
        if (error) throw error;
        
        if (data?.success) {
          await recordSuccess();
          return { success: true, queued: false };
        } else {
          const errorMsg = data?.error || 'Falha ao enviar mensagem';
          
          // Check if it's a transient error (network, timeout, 5xx)
          const isTransient = errorMsg.includes('timeout') || 
                             errorMsg.includes('network') ||
                             errorMsg.includes('500') ||
                             errorMsg.includes('502') ||
                             errorMsg.includes('503') ||
                             errorMsg.includes('504');
          
          if (isTransient) {
            await recordFailure(errorMsg);
            
            // If circuit just opened or was already open, queue the message
            if (circuitState?.failure_count && circuitState.failure_count + 1 >= circuitState.failure_threshold) {
              const queueId = await addToQueue(params);
              return { success: false, queued: true, queueId, reason: errorMsg };
            }
          }
          
          throw new Error(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
        
        // Record failure for circuit breaker
        await recordFailure(errorMsg);
        
        // Queue if circuit is now open
        if (circuitState?.state === 'open' || 
            (circuitState?.failure_count && circuitState.failure_count + 1 >= circuitState.failure_threshold)) {
          const queueId = await addToQueue(params);
          return { success: false, queued: true, queueId, reason: errorMsg };
        }
        
        throw err;
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar mensagem: ${error.message}`);
    },
  });

  // Process queued messages
  const processQueue = useCallback(async () => {
    if (!user?.id || isProcessingQueue || queuedMessages.length === 0) return;
    if (circuitState?.state === 'open' && !shouldTryHalfOpen()) return;
    
    setIsProcessingQueue(true);
    let processed = 0;
    let failed = 0;
    
    try {
      for (const msg of queuedMessages.slice(0, 10)) { // Process max 10 at a time
        // Mark as processing
        await supabase
          .from('evolution_message_queue')
          .update({ status: 'processing' })
          .eq('id', msg.id);
        
        try {
          // Get fresh token from config
          const { data: globalConfig } = await supabase
            .from('whatsapp_global_config')
            .select('api_token')
            .eq('is_active', true)
            .maybeSingle();
          
          const msgConfig = msg.config as { api_url?: string; instance_name?: string };
          const { data, error } = await supabase.functions.invoke('evolution-api', {
            body: {
              action: 'send_message',
              userId: user.id,
              phone: msg.phone,
              message: msg.message,
              config: {
                api_url: msgConfig.api_url || '',
                api_token: globalConfig?.api_token,
                instance_name: msgConfig.instance_name || '',
              },
            },
          });
          
          if (error || !data?.success) {
            throw new Error(data?.error || error?.message || 'Falha ao enviar');
          }
          
          // Success - mark as sent
          await supabase
            .from('evolution_message_queue')
            .update({ 
              status: 'sent', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', msg.id);
          
          await recordSuccess();
          processed++;
          
          // Small delay between messages
          await new Promise(r => setTimeout(r, 2000));
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Erro';
          
          // Update retry count or mark as failed
          const newRetryCount = msg.retry_count + 1;
          
          if (newRetryCount >= msg.max_retries) {
            await supabase
              .from('evolution_message_queue')
              .update({ 
                status: 'failed', 
                error_message: errorMsg,
                retry_count: newRetryCount,
              })
              .eq('id', msg.id);
            failed++;
          } else {
            await supabase
              .from('evolution_message_queue')
              .update({ 
                status: 'queued',
                error_message: errorMsg,
                retry_count: newRetryCount,
                next_retry_at: new Date(Date.now() + 60000).toISOString(), // 1 min
              })
              .eq('id', msg.id);
          }
          
          await recordFailure(errorMsg);
          
          // If circuit opened, stop processing
          if (circuitState?.state === 'open') break;
        }
      }
    } finally {
      setIsProcessingQueue(false);
      refetchQueue();
      
      if (processed > 0 || failed > 0) {
        toast.info(`Fila: ${processed} enviados, ${failed} falharam`);
      }
    }
  }, [user?.id, isProcessingQueue, queuedMessages, circuitState, shouldTryHalfOpen, recordSuccess, recordFailure, refetchQueue]);

  // Auto-process queue when circuit closes
  useEffect(() => {
    if (circuitState?.state === 'closed' && queuedMessages.length > 0 && !isProcessingQueue) {
      const timer = setTimeout(() => {
        processQueue();
      }, 5000); // Wait 5s before processing
      return () => clearTimeout(timer);
    }
  }, [circuitState?.state, queuedMessages.length, isProcessingQueue, processQueue]);

  // Manual reset circuit
  const resetCircuit = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from('evolution_circuit_breaker')
      .update({
        state: 'closed',
        failure_count: 0,
        success_count: 0,
        opened_at: null,
        last_error: null,
      })
      .eq('seller_id', user.id);
    
    refetchCircuit();
    toast.success('Circuit breaker resetado');
  }, [user?.id, refetchCircuit]);

  // Clear queue
  const clearQueue = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from('evolution_message_queue')
      .delete()
      .eq('seller_id', user.id)
      .in('status', ['queued', 'failed']);
    
    refetchQueue();
    toast.success('Fila limpa');
  }, [user?.id, refetchQueue]);

  return {
    // State
    circuitState,
    isOpen: circuitState?.state === 'open',
    isHalfOpen: circuitState?.state === 'half_open',
    isClosed: circuitState?.state === 'closed' || !circuitState,
    queuedMessages,
    queueLength: queuedMessages.length,
    isProcessingQueue,
    
    // Actions
    sendWithCircuitBreaker,
    processQueue,
    resetCircuit,
    clearQueue,
    addToQueue,
    
    // Helpers
    shouldTryHalfOpen,
    refetchCircuit,
    refetchQueue,
  };
}

export type { CircuitBreakerState, QueuedMessage, SendMessageParams };
