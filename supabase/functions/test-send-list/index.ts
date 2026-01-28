/**
 * TEST SEND LIST - Função de teste para sendList (listas interativas)
 * Testa o endpoint /message/sendList da Evolution API
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSendListPayloadVariants } from "../_shared/evolution-sendlist.ts";
import type { InteractiveListMessage } from "../_shared/interactive-list.ts";

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

    const { seller_id, phone, lookup_by_phone, title, description, sections } = await req.json();

    let instance = null;

    // Buscar instância por seller_id ou por telefone conectado
    if (seller_id) {
      const { data } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', seller_id)
        .maybeSingle();
      instance = data;
    } else if (lookup_by_phone || phone) {
      const searchPhone = String(lookup_by_phone || phone).replace(/\D/g, '');
      const phoneVariants = [
        searchPhone,
        searchPhone.startsWith('55') ? searchPhone.slice(2) : `55${searchPhone}`,
        searchPhone.length === 11 ? `55${searchPhone}` : searchPhone,
      ];
      
      for (const variant of phoneVariants) {
        const { data } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .ilike('connected_phone', `%${variant}%`)
          .eq('is_connected', true)
          .maybeSingle();
        
        if (data) {
          instance = data;
          console.log(`[test-send-list] Found instance by phone ${variant}:`, data.instance_name);
          break;
        }
      }
    }

    if (!instance) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Instance not found', 
          hint: 'Provide seller_id or lookup_by_phone'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[test-send-list] Using instance: ${instance.instance_name}`);

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

    // Criar lista de teste padrão ou customizada
    const listMessage: InteractiveListMessage = {
      title: title || 'Menu Principal',
      description: description || 'Escolha uma das opções abaixo:',
      buttonText: 'Ver Opções',
      footerText: 'Bot IPTV',
      sections: sections || [
        {
          title: 'Serviços',
          rows: [
            { rowId: 'teste', title: '🎬 Teste Grátis', description: 'Solicitar um teste' },
            { rowId: 'planos', title: '💰 Ver Planos', description: 'Preços e pacotes' },
            { rowId: 'renovar', title: '🔄 Renovar', description: 'Renovar assinatura' },
          ],
        },
        {
          title: 'Suporte',
          rows: [
            { rowId: 'ajuda', title: '❓ Ajuda', description: 'Perguntas frequentes' },
            { rowId: 'atendente', title: '👤 Atendente', description: 'Falar com humano' },
          ],
        },
      ],
    };

    console.log('[test-send-list] Sending list:', JSON.stringify(listMessage).substring(0, 500));

    const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
    const sendListUrl = `${apiUrl}/message/sendList/${instance.instance_name}`;

    const attempts: any[] = [];
    let success = false;
    let successVariant = '';

    // Gerar variantes de payload
    const variants = buildSendListPayloadVariants(listMessage, cleanPhone);

    for (const v of variants) {
      try {
        console.log(`[test-send-list] Trying variant=${v.name}`);
        console.log(`[test-send-list] Payload: ${JSON.stringify(v.payload).substring(0, 1000)}`);
        
        const response = await fetch(sendListUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': globalConfig.api_token,
          },
          body: JSON.stringify(v.payload),
        });

        const responseText = await response.text();
        
        attempts.push({
          variant: v.name,
          status: response.status,
          ok: response.ok,
          response: responseText.substring(0, 800),
        });

        if (response.ok) {
          // Verificar se a lista foi aceita corretamente
          const hasListData = responseText.includes('singleSelectReply') || 
                              responseText.includes('listMessage') ||
                              responseText.includes('sections') ||
                              responseText.includes('"title"');
          
          if (hasListData) {
            success = true;
            successVariant = v.name;
            console.log(`[test-send-list] ✅ Success with ${v.name}`);
            break;
          } else {
            console.log(`[test-send-list] ⚠️ API returned 201 but response unclear: ${responseText.substring(0, 200)}`);
            // Aceitar mesmo assim se retornou 201
            success = true;
            successVariant = v.name;
            break;
          }
        } else {
          console.log(`[test-send-list] ❌ Failed: ${response.status} - ${responseText.substring(0, 300)}`);
        }
      } catch (err) {
        attempts.push({
          variant: v.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback para texto formatado
    if (!success) {
      console.log('[test-send-list] ⚠️ List failed, trying text fallback');
      
      let textFallback = `📋 *${listMessage.title}*\n`;
      if (listMessage.description) {
        textFallback += `${listMessage.description}\n\n`;
      }
      
      let optionNum = 1;
      for (const section of listMessage.sections) {
        textFallback += `*${section.title}*\n`;
        for (const row of section.rows) {
          textFallback += `*${optionNum}.* ${row.title}\n`;
          optionNum++;
        }
        textFallback += '\n';
      }
      textFallback += '_Digite o número da opção desejada_';

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
              message: textFallback,
              phone: cleanPhone,
              instance: instance.instance_name,
              attempts,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (textErr) {
        attempts.push({
          variant: 'text_fallback',
          error: textErr instanceof Error ? textErr.message : String(textErr),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success,
        mode: success ? 'list' : 'failed',
        success_variant: successVariant,
        phone: cleanPhone,
        instance: instance.instance_name,
        url: sendListUrl,
        attempts,
      }),
      { 
        status: success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[test-send-list] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
