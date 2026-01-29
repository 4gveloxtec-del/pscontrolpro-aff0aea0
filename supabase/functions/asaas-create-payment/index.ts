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
    const { reseller_id, amount, description, due_date } = await req.json();

    if (!reseller_id || !amount || !due_date) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // Get reseller info
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, email, phone, cpf_cnpj')
      .eq('id', reseller_id)
      .single();

    if (resellerError || !reseller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Revendedor não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Check if customer exists in ASAAS or create one
    let customerId: string;

    // Search for existing customer by email
    const searchResponse = await fetch(
      `${baseUrl}/customers?email=${encodeURIComponent(reseller.email)}`,
      {
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    const searchData = await searchResponse.json();

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // Create new customer
      const customerResponse = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: reseller.full_name || reseller.email,
          email: reseller.email,
          phone: reseller.phone?.replace(/\D/g, ''),
          cpfCnpj: reseller.cpf_cnpj?.replace(/\D/g, ''),
          externalReference: reseller.id
        })
      });

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json();
        console.error('Error creating customer:', errorData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorData.errors?.[0]?.description || 'Erro ao criar cliente no ASAAS' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const customerData = await customerResponse.json();
      customerId = customerData.id;
    }

    // Create payment with PIX
    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: amount,
        dueDate: due_date,
        description: description || 'Mensalidade',
        externalReference: reseller.id
      })
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      console.error('Error creating payment:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorData.errors?.[0]?.description || 'Erro ao criar cobrança' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const paymentData = await paymentResponse.json();

    // Get PIX QR Code
    const pixResponse = await fetch(`${baseUrl}/payments/${paymentData.id}/pixQrCode`, {
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    let pixData = null;
    if (pixResponse.ok) {
      pixData = await pixResponse.json();
    }

    // Get auth header to identify admin
    const authHeader = req.headers.get('Authorization');
    let adminId = null;
    if (authHeader) {
      const { data: { user } } = await supabaseClient.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      adminId = user?.id;
    }

    // Save payment to database
    const { data: savedPayment, error: saveError } = await supabaseClient
      .from('asaas_reseller_payments')
      .insert({
        reseller_id,
        asaas_payment_id: paymentData.id,
        asaas_customer_id: customerId,
        amount,
        description: description || 'Mensalidade',
        status: paymentData.status.toLowerCase(),
        due_date,
        pix_copy_paste: pixData?.payload,
        pix_qr_code: pixData?.encodedImage,
        invoice_url: paymentData.invoiceUrl,
        created_by: adminId
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving payment:', saveError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        payment: savedPayment,
        asaas_payment: paymentData,
        pix: pixData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating ASAAS payment:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
