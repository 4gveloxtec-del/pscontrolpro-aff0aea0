import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Correct webhook URL - must match connection-heartbeat endpoint
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
): Promise<{ success: boolean; error?: string; method?: string; details?: string }> {
  const baseUrl = normalizeApiUrl(apiUrl);
  
  // Multiple payload formats to ensure compatibility with different Evolution API versions
  const attempts = [
    // Format 1: Nested webhook object (Evolution API v2 standard) - MOST COMMON
    { 
      method: 'POST', 
      url: `${baseUrl}/webhook/set/${instanceName}`,
      body: {
        webhook: {
          url: GLOBAL_WEBHOOK_URL,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
        }
      }
    },
    // Format 2: Direct object without nesting (some Evolution API versions)
    { 
      method: 'POST', 
      url: `${baseUrl}/webhook/set/${instanceName}`,
      body: {
        url: GLOBAL_WEBHOOK_URL,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      }
    },
    // Format 3: Minimal nested webhook
    { 
      method: 'POST', 
      url: `${baseUrl}/webhook/set/${instanceName}`,
      body: {
        webhook: {
          url: GLOBAL_WEBHOOK_URL,
          enabled: true
        }
      }
    },
    // Format 4: PUT method
    { 
      method: 'PUT', 
      url: `${baseUrl}/webhook/set/${instanceName}`,
      body: {
        webhook: {
          url: GLOBAL_WEBHOOK_URL,
          enabled: true,
          webhookByEvents: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
        }
      }
    },
    // Format 5: instance/setWebhook endpoint
    { 
      method: 'POST', 
      url: `${baseUrl}/instance/setWebhook/${instanceName}`,
      body: {
        url: GLOBAL_WEBHOOK_URL,
        enabled: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }
    },
    // Format 6: settings endpoint
    { 
      method: 'POST', 
      url: `${baseUrl}/settings/set/${instanceName}`,
      body: {
        webhook: {
          url: GLOBAL_WEBHOOK_URL,
          enabled: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
        }
      }
    }
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      console.log(`[reconfigure-webhook] Trying: ${attempt.method} ${attempt.url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify(attempt.body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`[reconfigure-webhook] Response ${response.status}: ${responseText.substring(0, 300)}`);

      if (response.ok) {
        return { 
          success: true, 
          method: `${attempt.method} ${attempt.url}`,
          details: `Webhook configurado: ${responseText.substring(0, 100)}`
        };
      } else {
        errors.push(`${attempt.method} ${attempt.url.split('/').pop()}: ${response.status}`);
      }
    } catch (err: any) {
      const errMsg = err.name === 'AbortError' ? 'Timeout' : err.message;
      console.log(`[reconfigure-webhook] Error: ${errMsg}`);
      errors.push(`${attempt.url.split('/').pop()}: ${errMsg}`);
    }
  }

  return { 
    success: false, 
    error: 'Nenhum formato de webhook funcionou',
    details: errors.join(' | ')
  };
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
      return new Response(JSON.stringify({ 
        error: 'Configuração global não encontrada',
        details: configError?.message 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log('[reconfigure-webhook] Global config found:', {
      api_url: globalConfig.api_url,
      has_token: !!globalConfig.api_token
    });

    // Get instances to reconfigure
    let query = supabase
      .from('whatsapp_seller_instances')
      .select('*');

    if (targetSellerId) {
      query = query.eq('seller_id', targetSellerId);
    } else {
      // By default, reconfigure ALL instances (connected or not)
      // This ensures new instances get webhook too
      query = query.not('instance_name', 'is', null);
    }

    const { data: instances, error: instancesError } = await query;

    if (instancesError) {
      return new Response(JSON.stringify({ error: instancesError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Nenhuma instância para reconfigurar',
        reconfigured: 0,
        results: []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[reconfigure-webhook] Processing ${instances.length} instances`);

    const results: any[] = [];

    for (const instance of instances) {
      if (!instance.instance_name) {
        results.push({
          seller_id: instance.seller_id,
          skipped: true,
          reason: 'No instance name'
        });
        continue;
      }

      const evolutionInstanceName = instance.instance_name;
      console.log(`[reconfigure-webhook] Processing: ${evolutionInstanceName}`);
      
      const result = await configureWebhook(
        globalConfig.api_url,
        globalConfig.api_token,
        evolutionInstanceName
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
        is_connected: instance.is_connected,
        webhook_url: GLOBAL_WEBHOOK_URL,
        ...result,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => r.success === false).length;

    return new Response(JSON.stringify({
      success: true,
      webhook_url: GLOBAL_WEBHOOK_URL,
      api_url: globalConfig.api_url,
      total: instances.length,
      reconfigured: successCount,
      failed: failCount,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('[reconfigure-webhook] Critical error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});