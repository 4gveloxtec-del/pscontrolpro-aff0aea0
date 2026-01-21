import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays, isAfter } from 'date-fns';
import { ensureClientNotificationTracking } from '@/lib/idempotency';

interface RenewalData {
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
  clientCategory?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  currentExpirationDate: string;
  planId?: string | null;
  durationDays: number;
}

interface RenewalResult {
  success: boolean;
  newExpirationDate?: string;
  error?: string;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// Helper to decrypt data using the crypto edge function
async function decryptData(ciphertext: string | null): Promise<string> {
  if (!ciphertext) return '';
  
  try {
    const { data: session } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('crypto', {
      headers: {
        Authorization: `Bearer ${session?.session?.access_token}`,
      },
      body: { action: 'decrypt', data: ciphertext },
    });

    if (error) {
      console.error('Decryption error:', error);
      return ciphertext; // Return original if decryption fails
    }

    return data.result || ciphertext;
  } catch {
    return ciphertext; // Return original if decryption fails
  }
}

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

  // Check if WhatsApp API is available
  const { data: sellerInstance } = useQuery({
    queryKey: ['whatsapp-seller-instance-renewal', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', userId!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const { data: globalConfig } = useQuery({
    queryKey: ['whatsapp-global-config-renewal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .eq('is_active', true)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    staleTime: 30000,
  });

  const { data: sellerProfile } = useQuery({
    queryKey: ['seller-profile-renewal', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_name, full_name, pix_key')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const canSendViaApi = !!(
    sellerInstance?.is_connected &&
    !sellerInstance?.instance_blocked &&
    globalConfig?.is_active
  );

  // Function to send renewal confirmation via WhatsApp API
  const sendRenewalConfirmation = useCallback(async (
    data: RenewalData,
    newExpirationDate: string
  ) => {
    console.log('[Renewal] Starting sendRenewalConfirmation...', { 
      clientName: data.clientName, 
      phone: data.clientPhone 
    });

    if (!data.clientPhone) {
      console.log('[Renewal] No phone number - skipping message');
      return;
    }

    try {
      // Fetch fresh data to avoid stale closures
      const [instanceResult, configResult, profileResult, clientResult] = await Promise.all([
        supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('seller_id', userId!)
          .single(),
        supabase
          .from('whatsapp_global_config')
          .select('*')
          .eq('is_active', true)
          .single(),
        supabase
          .from('profiles')
          .select('company_name, full_name, pix_key')
          .eq('id', userId!)
          .single(),
        supabase
          .from('clients')
          .select('login, password')
          .eq('id', data.clientId)
          .single(),
      ]);

      const instance = instanceResult.data;
      const config = configResult.data;
      const profile = profileResult.data;
      const client = clientResult.data as { login: string | null; password: string | null } | null;

      console.log('[Renewal] Fetched config:', { 
        hasInstance: !!instance, 
        isConnected: instance?.is_connected,
        isBlocked: instance?.instance_blocked,
        hasConfig: !!config,
        configActive: config?.is_active
      });

      // Check if can send via API
      const canSend = !!(
        instance?.is_connected &&
        !instance?.instance_blocked &&
        config?.is_active
      );

      if (!canSend) {
        console.log('[Renewal] Cannot send via API - not connected or blocked');
        return;
      }

      // Get renewal template
      const categoryName = typeof data.clientCategory === 'object' 
        ? (data.clientCategory as any)?.name 
        : data.clientCategory;
      
      const categoryPrefix = categoryName?.toLowerCase() || '';
      
      const { data: templates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', userId!)
        .or(`type.ilike.%renov%,name.ilike.%renov%,type.ilike.%confirmacao%,name.ilike.%confirmacao%`)
        .order('created_at', { ascending: false });

      console.log('[Renewal] Templates found:', templates?.length || 0);

      // Find best matching template
      let template = templates?.find(t => 
        t.name.toLowerCase().includes(categoryPrefix) && 
        (t.name.toLowerCase().includes('renov') || t.name.toLowerCase().includes('confirmação'))
      );

      // Fallback to any renewal template
      if (!template) {
        template = templates?.find(t => 
          t.type?.toLowerCase().includes('renov') || 
          t.name.toLowerCase().includes('renov') ||
          t.name.toLowerCase().includes('confirmação')
        );
      }

      if (!template) {
        console.log('[Renewal] No renewal template found - skipping message');
        return;
      }

      console.log('[Renewal] Using template:', template.name);

      // Replace variables in template - decrypt login/password first
      const empresa = profile?.company_name || profile?.full_name || '';
      const [login, senha] = await Promise.all([
        decryptData(client?.login || null),
        decryptData(client?.password || null),
      ]);

      console.log('[Renewal] Credentials processed');

      const message = template.message
        .replace(/{nome}/gi, data.clientName)
        .replace(/{vencimento}/gi, format(new Date(newExpirationDate), 'dd/MM/yyyy'))
        .replace(/{plano}/gi, data.planName || '')
        .replace(/{valor}/gi, data.planPrice?.toFixed(2) || '0.00')
        .replace(/{preco}/gi, data.planPrice?.toFixed(2) || '0.00')
        .replace(/{empresa}/gi, empresa)
        .replace(/{pix}/gi, profile?.pix_key || '')
        .replace(/{login}/gi, login)
        .replace(/{usuario}/gi, login)
        .replace(/{senha}/gi, senha);

      const phoneNumber = data.clientPhone.replace(/\D/g, '');

      console.log('[Renewal] Sending message to:', phoneNumber);

      // Send via Evolution API
      const { data: apiResponse, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send_message',
          userId: userId,
          phone: phoneNumber,
          message: message,
          config: {
            api_url: config?.api_url,
            api_token: config?.api_token,
            instance_name: instance?.instance_name,
          },
        },
      });

      if (error) {
        console.error('[Renewal] Error invoking function:', error);
        return;
      }

      if (apiResponse?.blocked) {
        console.error('[Renewal] Instance blocked:', apiResponse.reason);
        return;
      }

      if (!apiResponse?.success) {
        console.error('[Renewal] Message send failed:', apiResponse?.error);
        return;
      }

      // Log to message history
      await supabase.from('message_history').insert({
        seller_id: userId!,
        client_id: data.clientId,
        template_id: template.id,
        message_type: 'renewal_confirmation',
        message_content: message,
        phone: phoneNumber,
      });

      // Track notification
      await ensureClientNotificationTracking(supabase, {
        client_id: data.clientId,
        seller_id: userId!,
        notification_type: 'renewal_confirmation',
        expiration_cycle_date: newExpirationDate,
        sent_via: 'api',
        service_type: 'main',
      });

      console.log('[Renewal] Confirmation message sent successfully');
      toast.success('Mensagem de renovação enviada!', { duration: 2000 });
    } catch (error) {
      console.error('[Renewal] Failed to send confirmation:', error);
      // Don't show error to user - renewal was successful, message is optional
    }
  }, [userId]);

  // Helper to calculate new expiration date - normalized to noon to avoid timezone issues
  const calculateNewExpiration = useCallback((currentExpiration: string, durationDays: number): string => {
    // Parse date with noon time to avoid UTC conversion issues
    const baseDate = new Date(currentExpiration + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
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
      
      // Send renewal confirmation via WhatsApp API (background, non-blocking)
      if (result.newExpirationDate) {
        sendRenewalConfirmation(data, result.newExpirationDate).catch(() => {
          // Silent fail - renewal was successful
        });
      }
      
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
