import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do pagamento não informado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get payment from database
    const { data: payment, error: paymentError } = await supabaseClient
      .from('asaas_reseller_payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pagamento não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (!payment.asaas_payment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pagamento não possui ID ASAAS' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get ASAAS config
    const { data: settings } = await supabaseClient
      .from('app_settings')
      .select('key, value')
      .in('key', ['asaas_api_key', 'asaas_environment']);

    const config: Record<string, string> = {};
    settings?.forEach(s => { config[s.key] = s.value; });

    const apiKey = config.asaas_api_key;
    const environment = config.asaas_environment || 'sandbox';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key ASAAS não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const baseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    // Get payment status from ASAAS
    const response = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}`, {
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorData.errors?.[0]?.description || 'Erro ao consultar pagamento' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const asaasPayment = await response.json();

    // Map ASAAS status to local status
    const statusMap: Record<string, string> = {
      'PENDING': 'pending',
      'RECEIVED': 'received',
      'CONFIRMED': 'confirmed',
      'OVERDUE': 'overdue',
      'REFUNDED': 'refunded',
      'RECEIVED_IN_CASH': 'received',
      'REFUND_REQUESTED': 'refunded',
      'REFUND_IN_PROGRESS': 'refunded',
      'CHARGEBACK_REQUESTED': 'refunded',
      'CHARGEBACK_DISPUTE': 'refunded',
      'AWAITING_CHARGEBACK_REVERSAL': 'refunded',
      'DUNNING_REQUESTED': 'overdue',
      'DUNNING_RECEIVED': 'received',
      'AWAITING_RISK_ANALYSIS': 'pending'
    };

    const newStatus = statusMap[asaasPayment.status] || asaasPayment.status.toLowerCase();
    const isPaid = ['received', 'confirmed'].includes(newStatus);

    // Update payment in database
    const { error: updateError } = await supabaseClient
      .from('asaas_reseller_payments')
      .update({
        status: newStatus,
        paid_at: isPaid && !payment.paid_at ? new Date().toISOString() : payment.paid_at,
        invoice_url: asaasPayment.invoiceUrl || payment.invoice_url
      })
      .eq('id', payment_id);

    if (updateError) {
      console.error('Error updating payment:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: newStatus,
        asaas_status: asaasPayment.status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error syncing ASAAS payment:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
