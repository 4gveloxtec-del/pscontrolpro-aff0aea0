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
 
     // 5. Verificar menus ativos
     const { data: menus, error: menusError } = await supabase
       .from('bot_engine_menus')
       .select('*')
       .eq('seller_id', sellerId)
       .eq('is_active', true);
 
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
         list: flows?.map(f => ({ id: f.id, name: f.name, trigger_type: f.trigger_type })) || [],
         error: flowsError?.message || null,
       },
       menus: {
         count: menus?.length || 0,
         list: menus?.map(m => ({ id: m.id, menu_key: m.menu_key, title: m.title })) || [],
         error: menusError?.message || null,
       },
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