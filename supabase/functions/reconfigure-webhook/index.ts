import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Correct webhook URL
const GLOBAL_WEBHOOK_URL = "https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/connection-heartbeat";

function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
}

async function configureWebhook(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<{ success: boolean; error?: string; method?: string }> {
  const baseUrl = normalizeApiUrl(apiUrl);
  
  // Try multiple endpoint formats
  const attempts = [
    { 
      method: 'POST', 
      url: `${baseUrl}/webhook/set/${instanceName}`,
      body: {
        url: GLOBAL_WEBHOOK_URL,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      }
    },
    { 
      method: 'PUT', 
      url: `${baseUrl}/instance/setWebhook/${instanceName}`,
      body: {
        url: GLOBAL_WEBHOOK_URL,
        enabled: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }
    },
    { 
      method: 'POST', 
      url: `${baseUrl}/instance/setWebhook/${instanceName}`,
      body: {
        url: GLOBAL_WEBHOOK_URL,
        enabled: true,
        webhook_by_events: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }
    }
  ];

  for (const attempt of attempts) {
    try {
      console.log(`Trying: ${attempt.method} ${attempt.url}`);
      
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify(attempt.body),
      });

      const responseText = await response.text();
      console.log(`Response ${response.status}: ${responseText}`);

      if (response.ok) {
        return { success: true, method: `${attempt.method} ${attempt.url}` };
      }
    } catch (err: any) {
      console.log(`Error: ${err.message}`);
    }
  }

  return { success: false, error: 'All webhook configuration attempts failed' };
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
    const targetSellerId = body.seller_id;

    // Get global config
    const { data: globalConfig, error: configError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(JSON.stringify({ error: 'Global config not found' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get instances to reconfigure
    let query = supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('is_connected', true);

    if (targetSellerId) {
      query = query.eq('seller_id', targetSellerId);
    }

    const { data: instances, error: instancesError } = await query;

    if (instancesError) {
      return new Response(JSON.stringify({ error: instancesError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results: any[] = [];

    for (const instance of instances || []) {
      const result = await configureWebhook(
        globalConfig.api_url,
        globalConfig.api_token,
        instance.instance_name
      );

      // Update database
      await supabase
        .from('whatsapp_seller_instances')
        .update({
          webhook_auto_configured: result.success,
          configuration_error: result.success ? null : result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      results.push({
        seller_id: instance.seller_id,
        instance_name: instance.instance_name,
        webhook_url: GLOBAL_WEBHOOK_URL,
        ...result,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      webhook_url: GLOBAL_WEBHOOK_URL,
      reconfigured: results.length,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
