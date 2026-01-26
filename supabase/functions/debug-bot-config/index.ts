 import { createClient } from "npm:@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 Deno.serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, serviceRoleKey);
 
     const body = await req.json().catch(() => ({}));
     const sellerId = body.seller_id || "c4f9e3be-13ce-4648-9d88-9b1cccd4a67e";
 
     // 1. Verificar config do bot
     const { data: botConfig, error: botError } = await supabase
       .from('bot_engine_config')
       .select('*')
       .eq('seller_id', sellerId)
       .maybeSingle();
 
     // 2. Verificar instância WhatsApp
     const { data: whatsappInstance, error: waError } = await supabase
       .from('whatsapp_seller_instances')
       .select('*')
       .eq('seller_id', sellerId)
       .maybeSingle();
 
     // 3. Verificar config global Evolution API
     const { data: globalConfig, error: globalError } = await supabase
       .from('whatsapp_global_config')
       .select('*')
       .eq('is_active', true)
       .maybeSingle();
 
      // 4. Verificar fluxos ativos
      const { data: flows, error: flowsError } = await supabase
        .from('bot_engine_flows')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_active', true);

      // 5. Verificar menus LEGADO (bot_engine_menus)
      const { data: menusLegacy, error: menusLegacyError } = await supabase
        .from('bot_engine_menus')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_active', true);

      // 6. Verificar menus DINÂMICOS V2 (bot_engine_dynamic_menus)
      const { data: menusV2, error: menusV2Error } = await supabase
        .from('bot_engine_dynamic_menus')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_active', true);

      // 7. Verificar menu raiz V2
      const { data: rootMenuV2, error: rootError } = await supabase
        .from('bot_engine_dynamic_menus')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_root', true)
        .eq('is_active', true)
        .maybeSingle();
 
      const diagnostic = {
        seller_id: sellerId,
        bot_engine_config: {
          exists: !!botConfig,
          is_enabled: botConfig?.is_enabled || false,
          welcome_message: botConfig?.welcome_message || null,
          fallback_message: botConfig?.fallback_message || null,
          error: botError?.message || null,
        },
        whatsapp_instance: {
          exists: !!whatsappInstance,
          instance_name: whatsappInstance?.instance_name || null,
          is_connected: whatsappInstance?.is_connected || false,
          instance_link: whatsappInstance?.instance_link || null,
          error: waError?.message || null,
        },
        global_config: {
          exists: !!globalConfig,
          api_url: globalConfig?.api_url || null,
          has_token: !!globalConfig?.api_token,
          error: globalError?.message || null,
        },
        flows: {
          count: flows?.length || 0,
          list: flows?.map((f: any) => ({ id: f.id, name: f.name, trigger_type: f.trigger_type })) || [],
          error: flowsError?.message || null,
        },
        menus_legacy: {
          count: menusLegacy?.length || 0,
          list: menusLegacy?.map((m: any) => ({ id: m.id, menu_key: m.menu_key, title: m.title })) || [],
          error: menusLegacyError?.message || null,
        },
        menus_v2: {
          count: menusV2?.length || 0,
          list: menusV2?.map((m: any) => ({ id: m.id, menu_key: m.menu_key, title: m.title, is_root: m.is_root })) || [],
          error: menusV2Error?.message || null,
        },
        root_menu_v2: {
          exists: !!rootMenuV2,
          menu_key: rootMenuV2?.menu_key || null,
          title: rootMenuV2?.title || null,
          error: rootError?.message || null,
        },
        diagnosis: (() => {
          if (!botConfig) {
            return "❌ CRÍTICO: Configuração do BotEngine não encontrada!";
          }
          if (!botConfig.is_enabled) {
            return "⚠️ BotEngine está DESABILITADO. Ative em Chatbot > Configuração.";
          }
          if (!whatsappInstance?.is_connected) {
            return "⚠️ WhatsApp não conectado.";
          }
          if (!globalConfig) {
            return "❌ Configuração global do WhatsApp não encontrada.";
          }
          if ((menusV2?.length || 0) === 0) {
            return "⚠️ Nenhum menu dinâmico V2 criado. Vá em Chatbot > Menus Dinâmicos e clique em 'Gerar Modelo Base'.";
          }
          if (!rootMenuV2) {
            return "⚠️ Nenhum menu RAIZ definido. Vá em Menus Dinâmicos, clique nos 3 pontos (⋮) e selecione 'Definir como Inicial'.";
          }
          return "✅ Tudo configurado corretamente! Bot deve funcionar.";
        })(),
      };
 
     return new Response(JSON.stringify(diagnostic, null, 2), {
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   } catch (error: any) {
     return new Response(
       JSON.stringify({ error: error.message }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });