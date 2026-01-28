/**
 * TEST SEND BUTTONS - Função de teste direto para sendButtons
 * Envia botões interativos via Evolution API para testar compatibilidade
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { 
  buildSendButtonsPayloadVariants, 
  buttonsToTextFallback,
  type ButtonsMessage 
} from "../_shared/evolution-sendbuttons.ts";

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

    const { seller_id, phone, buttons, title, description } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing seller_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar instância do revendedor
    const { data: instance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', seller_id)
      .maybeSingle();

    if (!instance) {
      return new Response(
        JSON.stringify({ success: false, error: 'Instance not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar API global
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_token')
      .eq('is_active', true)
      .maybeSingle();

    if (!globalConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'Global config not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanPhone = String(phone || instance.connected_phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      return new Response(
        JSON.stringify({ success: false, error: 'No phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar mensagem de botões padrão ou customizada
    const buttonsMessage: ButtonsMessage = {
      title: title || 'Confirmação',
      description: description || 'Escolha uma opção:',
      footerText: 'Bot IPTV',
      buttons: buttons || [
        { buttonId: 'sim', buttonText: '✅ Sim' },
        { buttonId: 'nao', buttonText: '❌ Não' },
      ],
    };

    console.log('[test-send-buttons] Sending buttons:', buttonsMessage);

    const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
    const apiUrlV1 = apiUrl.endsWith('/api/v1') ? apiUrl : `${apiUrl}/api/v1`;
    
    const sendButtonsUrls = [
      `${apiUrl}/message/sendButtons/${instance.instance_name}`,
      `${apiUrl}/message/sendButtons`,
      `${apiUrlV1}/message/sendButtons/${instance.instance_name}`,
      `${apiUrlV1}/message/sendButtons`,
    ];

    const attempts: any[] = [];
    let success = false;
    let successUrl = '';
    let successVariant = '';

    const variants = buildSendButtonsPayloadVariants(buttonsMessage, cleanPhone);

    outer: for (const url of sendButtonsUrls) {
      for (const v of variants) {
        try {
          console.log(`[test-send-buttons] Trying url=${url} variant=${v.name}`);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': globalConfig.api_token,
              'Authorization': `Bearer ${globalConfig.api_token}`,
            },
            body: JSON.stringify(v.payload),
          });

          const responseText = await response.text();
          
          attempts.push({
            url,
            variant: v.name,
            status: response.status,
            ok: response.ok,
            response: responseText.substring(0, 500),
          });

          if (response.ok) {
            success = true;
            successUrl = url;
            successVariant = v.name;
            console.log(`[test-send-buttons] ✅ Success with ${v.name} at ${url}`);
            break outer;
          }
          
          console.log(`[test-send-buttons] ❌ Failed: ${response.status} - ${responseText.substring(0, 200)}`);
        } catch (err) {
          attempts.push({
            url,
            variant: v.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Fallback para texto se botões falharam
    if (!success) {
      console.log('[test-send-buttons] ⚠️ Buttons failed, trying text fallback');
      
      const textFallback = buttonsToTextFallback(buttonsMessage);
      const sendTextUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;
      
      try {
        const textResponse = await fetch(sendTextUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': globalConfig.api_token,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: textFallback,
          }),
        });

        const textResponseText = await textResponse.text();
        
        attempts.push({
          url: sendTextUrl,
          variant: 'text_fallback',
          status: textResponse.status,
          ok: textResponse.ok,
          response: textResponseText.substring(0, 500),
        });

        if (textResponse.ok) {
          return new Response(
            JSON.stringify({
              success: true,
              mode: 'text_fallback',
              message: 'Buttons failed, sent as text',
              phone: cleanPhone,
              attempts,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (textErr) {
        attempts.push({
          url: sendTextUrl,
          variant: 'text_fallback',
          error: textErr instanceof Error ? textErr.message : String(textErr),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success,
        mode: success ? 'buttons' : 'failed',
        success_url: successUrl,
        success_variant: successVariant,
        phone: cleanPhone,
        instance: instance.instance_name,
        attempts,
      }),
      { 
        status: success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[test-send-buttons] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
