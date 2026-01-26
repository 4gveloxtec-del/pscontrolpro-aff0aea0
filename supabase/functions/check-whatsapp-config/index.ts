import { createClient } from "npm:@supabase/supabase-js@2";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { seller_id } = await req.json();

    // Verificar config global
    const { data: globalConfig, error: globalError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    // Verificar instância do seller
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', seller_id)
      .maybeSingle();

    const result = {
      global_config: {
        exists: !!globalConfig,
        has_api_url: !!globalConfig?.api_url,
        has_api_token: !!globalConfig?.api_token,
        api_url: globalConfig?.api_url || null,
        error: globalError?.message || null,
      },
      seller_instance: {
        exists: !!instance,
        instance_name: instance?.instance_name || null,
        is_connected: instance?.is_connected || false,
        connected_phone: instance?.connected_phone || null,
        error: instanceError?.message || null,
      },
      diagnosis: (() => {
        if (!globalConfig) {
          return "❌ CRÍTICO: Configuração global do WhatsApp não encontrada! Bot não pode enviar mensagens.";
        }
        if (!globalConfig.api_url || !globalConfig.api_token) {
          return "❌ CRÍTICO: API URL ou Token ausente na config global! Bot não pode enviar mensagens.";
        }
        if (!instance) {
          return "❌ Instância do WhatsApp não encontrada para este seller.";
        }
        if (!instance.is_connected) {
          return "⚠️ Instância existe mas não está conectada.";
        }
        return "✅ Tudo configurado corretamente! Bot deve funcionar.";
      })(),
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});