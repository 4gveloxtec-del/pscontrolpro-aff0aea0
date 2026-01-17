import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays, isAfter } from 'date-fns';

interface RenewalData {
  clientId: string;
  clientName: string;
  currentExpirationDate: string;
  planId?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  durationDays: number;
}

interface RenewalResult {
  success: boolean;
  newExpirationDate?: string;
  error?: string;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// Log errors to Supabase (background, non-blocking)
async function logRenewalError(
  sellerId: string,
  clientId: string,
  clientName: string,
  errorMessage: string
) {
  try {
    // For now, just log to console. Can be extended to log to a Supabase table
    console.error('[Renewal Error]', {
      sellerId,
      clientId,
      clientName,
      errorMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail - logging shouldn't break the app
  }
}

export function useRenewalMutation(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [isRenewing, setIsRenewing] = useState(false);
  const renewalLockRef = useRef<Set<string>>(new Set());

  // Helper to calculate new expiration date
  const calculateNewExpiration = useCallback((currentExpiration: string, durationDays: number): string => {
    const baseDate = new Date(currentExpiration);
    const today = new Date();
    const newDate = isAfter(baseDate, today)
      ? addDays(baseDate, durationDays)
      : addDays(today, durationDays);
    return format(newDate, 'yyyy-MM-dd');
  }, []);

  // Retry logic with exponential backoff
  const executeWithRetry = useCallback(async (
    fn: () => Promise<void>,
    attempt = 1
  ): Promise<void> => {
    try {
      await fn();
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        return executeWithRetry(fn, attempt + 1);
      }
      throw error;
    }
  }, []);

  // Main renewal mutation
  const renewMutation = useMutation({
    mutationFn: async (data: RenewalData): Promise<RenewalResult> => {
      const { clientId, currentExpirationDate, planId, planName, planPrice, durationDays } = data;

      // Calculate new expiration
      const newExpirationDate = calculateNewExpiration(currentExpirationDate, durationDays);

      // Prepare update data - all fields in single transaction
      const updateData: Record<string, unknown> = {
        expiration_date: newExpirationDate,
        is_paid: true,
        renewed_at: new Date().toISOString(),
      };

      // Include plan info if provided
      if (planId !== undefined) {
        updateData.plan_id = planId;
        updateData.plan_name = planName;
        updateData.plan_price = planPrice;
      }

      // Execute update with retry
      await executeWithRetry(async () => {
        const { error } = await supabase
          .from('clients')
          .update(updateData)
          .eq('id', clientId);

        if (error) {
          throw error;
        }
      });

      return {
        success: true,
        newExpirationDate,
      };
    },

    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['clients'] });

      // Snapshot previous value for rollback
      const previousClients = queryClient.getQueryData<any[]>(['clients', userId]);

      // Optimistic update
      if (previousClients) {
        const newExpirationDate = calculateNewExpiration(data.currentExpirationDate, data.durationDays);
        
        queryClient.setQueryData<any[]>(['clients', userId], (old) =>
          old?.map(client =>
            client.id === data.clientId
              ? {
                  ...client,
                  expiration_date: newExpirationDate,
                  is_paid: true,
                  renewed_at: new Date().toISOString(),
                  ...(data.planId !== undefined && {
                    plan_id: data.planId,
                    plan_name: data.planName,
                    plan_price: data.planPrice,
                  }),
                }
              : client
          ) || []
        );
      }

      return { previousClients };
    },

    onSuccess: (result, data) => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      // Show success feedback
      toast.success(`${data.clientName} renovado até ${format(new Date(result.newExpirationDate!), 'dd/MM/yyyy')}`, {
        duration: 3000,
      });
    },

    onError: (error: Error, data, context) => {
      // Rollback to previous state
      if (context?.previousClients) {
        queryClient.setQueryData(['clients', userId], context.previousClients);
      }

      // Log error in background (non-blocking)
      if (userId) {
        logRenewalError(userId, data.clientId, data.clientName, error.message);
      }

      // Show user-friendly error without technical details
      toast.error('Não foi possível renovar o cliente. Tente novamente.', {
        duration: 4000,
      });
    },

    onSettled: () => {
      setIsRenewing(false);
    },
  });

  // Public function to renew a client (with lock protection)
  const renewClient = useCallback(async (
    data: RenewalData,
    onComplete?: () => void
  ): Promise<boolean> => {
    // Check if this client is already being renewed
    if (renewalLockRef.current.has(data.clientId)) {
      toast.info('Aguarde, renovação em andamento...', { duration: 2000 });
      return false;
    }

    // Lock this client
    renewalLockRef.current.add(data.clientId);
    setIsRenewing(true);

    try {
      await renewMutation.mutateAsync(data);
      
      // Call completion callback (for navigation/dialog close)
      onComplete?.();
      
      return true;
    } catch {
      return false;
    } finally {
      // Release lock
      renewalLockRef.current.delete(data.clientId);
    }
  }, [renewMutation]);

  // Quick renew (for button click without dialog)
  const quickRenew = useCallback(async (
    clientId: string,
    clientName: string,
    currentExpirationDate: string,
    durationDays: number = 30,
    onComplete?: () => void
  ): Promise<boolean> => {
    return renewClient({
      clientId,
      clientName,
      currentExpirationDate,
      durationDays,
    }, onComplete);
  }, [renewClient]);

  return {
    renewClient,
    quickRenew,
    isRenewing,
    isPending: renewMutation.isPending,
    calculateNewExpiration,
  };
}
