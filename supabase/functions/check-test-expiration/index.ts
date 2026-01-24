import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestClient {
  id: string;
  name: string;
  phone: string;
  seller_id: string;
  expiration_datetime: string;
  category: string;
  server_name?: string;
  plan_name?: string;
}

interface SellerProfile {
  full_name: string;
  company_name?: string;
  pix_key?: string;
}

interface WhatsAppInstance {
  instance_name: string;
  api_key: string;
  base_url: string;
  status: string;
}

/**
 * Edge Function para verificar e notificar testes prestes a expirar
 * Envia lembrete 30 minutos antes do teste expirar
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Calcular janela de 30 minutos
    const now = new Date();
    const in30Min = new Date(now.getTime() + 30 * 60 * 1000);
    const in35Min = new Date(now.getTime() + 35 * 60 * 1000);

    console.log(`[check-test-expiration] Checking for tests expiring between ${in30Min.toISOString()} and ${in35Min.toISOString()}`);

    // Buscar testes que expiram em ~30 minutos (janela de 5min para evitar perder)
    const { data: expiringTests, error: fetchError } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        phone,
        seller_id,
        expiration_datetime,
        category,
        servers(name),
        plans(name)
      `)
      .eq('is_test', true)
      .not('expiration_datetime', 'is', null)
      .gte('expiration_datetime', in30Min.toISOString())
      .lte('expiration_datetime', in35Min.toISOString());

    if (fetchError) {
      console.error('[check-test-expiration] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!expiringTests || expiringTests.length === 0) {
      console.log('[check-test-expiration] No tests expiring in 30 minutes');
      return new Response(
        JSON.stringify({ success: true, message: 'No tests expiring soon', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[check-test-expiration] Found ${expiringTests.length} tests expiring soon`);

    let sent = 0;
    let errors = 0;

    for (const test of expiringTests) {
      try {
        // Verificar se já enviamos lembrete para este teste
        const { data: existing } = await supabase
          .from('client_notification_tracking')
          .select('id')
          .eq('client_id', test.id)
          .eq('notification_type', 'test_expiring_30min')
          .maybeSingle();

        if (existing) {
          console.log(`[check-test-expiration] Already notified test ${test.id}`);
          continue;
        }

        // Buscar perfil do vendedor
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('full_name, company_name, pix_key')
          .eq('id', test.seller_id)
          .single();

        // Buscar instância WhatsApp do vendedor
        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('instance_name, api_key, base_url, status')
          .eq('seller_id', test.seller_id)
          .eq('status', 'connected')
          .maybeSingle();

        if (!instance) {
          console.log(`[check-test-expiration] No connected WhatsApp instance for seller ${test.seller_id}`);
          continue;
        }

        if (!test.phone) {
          console.log(`[check-test-expiration] No phone for test client ${test.id}`);
          continue;
        }

        // Formatar expiração
        const expDate = new Date(test.expiration_datetime);
        const expFormatted = expDate.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });

        // Montar mensagem de lembrete
        const empresa = sellerProfile?.company_name || sellerProfile?.full_name || 'Seu revendedor';
        const message = `⏰ *Olá ${test.name}!*

Seu teste expira em *30 minutos* (às ${expFormatted})!

📺 Gostou do serviço? Entre em contato para ativar seu plano completo!

${sellerProfile?.pix_key ? `💰 PIX: ${sellerProfile.pix_key}` : ''}

_${empresa}_`;

        // Enviar mensagem via Evolution API
        const sendUrl = `${instance.base_url}/message/sendText/${instance.instance_name}`;
        
        const phoneNumber = test.phone.replace(/\D/g, '');
        const formattedPhone = phoneNumber.startsWith('55') ? phoneNumber : `55${phoneNumber}`;

        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': instance.api_key,
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: message,
          }),
        });

        if (response.ok) {
          console.log(`[check-test-expiration] ✅ Sent reminder to ${test.name} (${test.phone})`);
          sent++;

          // Registrar envio
          await supabase.from('client_notification_tracking').insert({
            client_id: test.id,
            seller_id: test.seller_id,
            notification_type: 'test_expiring_30min',
            expiration_cycle_date: test.expiration_datetime.split('T')[0],
            sent_at: new Date().toISOString(),
            sent_via: 'whatsapp',
          });
        } else {
          const errText = await response.text();
          console.error(`[check-test-expiration] Failed to send to ${test.phone}:`, errText);
          errors++;
        }

      } catch (clientError) {
        console.error(`[check-test-expiration] Error processing test ${test.id}:`, clientError);
        errors++;
      }
    }

    console.log(`[check-test-expiration] Completed: ${sent} sent, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: expiringTests.length,
        sent,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-test-expiration] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
