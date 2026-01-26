import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { seller_id } = await req.json();

    // 1. Verificar configuração do webhook
    const { data: instance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', seller_id)
      .maybeSingle();

    // 2. Verificar últimos logs de conexão (últimos 10)
    const { data: logs } = await supabase
      .from('connection_logs')
      .select('*')
      .eq('seller_id', seller_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // 3. Verificar config global da API
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, is_active')
      .eq('is_active', true)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        webhook_url: `${supabaseUrl}/functions/v1/connection-heartbeat`,
        instance_config: instance,
        recent_webhook_logs: logs || [],
        logs_count: logs?.length || 0,
        global_api: globalConfig,
        diagnosis: logs && logs.length > 0 
          ? "✅ Webhook está recebendo eventos!" 
          : "❌ Nenhum evento recebido. Webhook pode não estar configurado na Evolution API.",
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});