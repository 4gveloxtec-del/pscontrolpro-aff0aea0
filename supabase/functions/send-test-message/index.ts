import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { seller_id, phone, message } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing seller_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar instância do revendedor
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', seller_id)
      .maybeSingle();

    if (instanceError || !instance) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Instance not found',
          details: instanceError?.message 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[send-test-message] Instance found:', {
      seller_id: instance.seller_id,
      instance_name: instance.instance_name,
      is_connected: instance.is_connected,
      connected_phone: instance.connected_phone
    });

    // Buscar API global para pegar api_url e api_token
    const { data: globalConfig, error: globalError } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_token')
      .eq('is_active', true)
      .maybeSingle();

    if (globalError || !globalConfig) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Global config not found',
          details: globalError?.message 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[send-test-message] Global config found:', {
      api_url: globalConfig.api_url?.substring(0, 30) + '...',
      has_token: !!globalConfig.api_token
    });

    // Normalizar telefone
    const cleanPhone = String(phone || instance.connected_phone || '')
      .replace(/\D/g, '');

    if (!cleanPhone) {
      return new Response(
        JSON.stringify({ success: false, error: 'No phone number available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const testMessage = message || `✅ *TESTE DO SISTEMA*\n\nEste é um teste direto da integração WhatsApp.\n\n📅 Horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n🔗 Instância: ${instance.instance_name}`;

    // Enviar mensagem via Evolution API
    const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
    const sendUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;

    console.log('[send-test-message] Sending to:', {
      url: sendUrl,
      phone: cleanPhone,
      message_preview: testMessage.substring(0, 50) + '...'
    });

    const evolutionResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': globalConfig.api_token
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: testMessage
      })
    });

    const responseText = await evolutionResponse.text();
    console.log('[send-test-message] Evolution API response:', {
      status: evolutionResponse.status,
      body: responseText.substring(0, 500)
    });

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!evolutionResponse.ok) {
      // Tentar formatos alternativos de telefone
      const alternativeFormats = [
        cleanPhone,
        `55${cleanPhone.replace(/^55/, '')}`,
        cleanPhone.replace(/^55/, ''),
        cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone,
        cleanPhone.length === 10 ? `55${cleanPhone.substring(0, 2)}9${cleanPhone.substring(2)}` : cleanPhone
      ];

      for (const altPhone of alternativeFormats.slice(1)) {
        console.log('[send-test-message] Retrying with:', altPhone);
        
        const retryResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': globalConfig.api_token
          },
          body: JSON.stringify({
            number: altPhone,
            text: testMessage
          })
        });

        const retryText = await retryResponse.text();
        console.log('[send-test-message] Retry response:', {
          phone: altPhone,
          status: retryResponse.status,
          body: retryText.substring(0, 200)
        });

        if (retryResponse.ok) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              phone_used: altPhone,
              response: JSON.parse(retryText) 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'All phone formats failed',
          last_status: evolutionResponse.status,
          last_response: responseData
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        phone_used: cleanPhone,
        response: responseData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-test-message] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
