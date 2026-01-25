import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const sellerId = body.seller_id;

    // Get global config - use maybeSingle to avoid PGRST116
    const { data: globalConfig, error: configError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError || !globalConfig) {
      return new Response(JSON.stringify({ 
        error: 'Global config not found',
        details: configError?.message 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    
    // List all instances on Evolution API
    const listUrl = `${baseUrl}/instance/fetchInstances`;
    console.log(`[list-instances] Fetching from: ${listUrl}`);
    
    // AbortController with 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response: Response;
    try {
      response = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'apikey': globalConfig.api_token,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch instances',
        status: response.status,
        details: errText
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const instances = await response.json();
    
    // Get seller's saved instance if sellerId provided
    let sellerInstance = null;
    if (sellerId) {
      const { data } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', sellerId)
        .maybeSingle();
      sellerInstance = data;
    }

    // Extract instance names and connection status
    const instanceList = instances.map((inst: any) => ({
      name: inst.instance?.instanceName || inst.instanceName || inst.name,
      state: inst.instance?.state || inst.state || 'unknown',
      ownerJid: inst.instance?.ownerJid || inst.ownerJid || null,
      connectionStatus: inst.instance?.connectionStatus || inst.connectionStatus || null,
    }));

    return new Response(JSON.stringify({
      success: true,
      api_url: globalConfig.api_url,
      total_instances: instanceList.length,
      instances: instanceList,
      seller_saved_instance: sellerInstance ? {
        instance_name: sellerInstance.instance_name,
        original_instance_name: sellerInstance.original_instance_name,
        connected_phone: sellerInstance.connected_phone,
        is_connected: sellerInstance.is_connected,
      } : null,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('[list-instances] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
