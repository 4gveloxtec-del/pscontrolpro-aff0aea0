import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build webhook URL dynamically from environment
function getWebhookUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is required");
  }
  return `${supabaseUrl}/functions/v1/connection-heartbeat`;
}

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
    const instanceName = body.instance_name || "seller_c4f9e3be";

    // Get global config - use maybeSingle to handle gracefully
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!globalConfig) {
      return new Response(JSON.stringify({ error: 'No global config' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const apiToken = globalConfig.api_token;

    const webhookTargetUrl = getWebhookUrl();
    const results: any = {
      base_url: baseUrl,
      instance_name: instanceName,
      target_webhook: webhookTargetUrl,
      tests: []
    };

    // Test 1: Check if instance exists
    try {
      const fetchUrl = `${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`;
      const fetchRes = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'apikey': apiToken },
      });
      const fetchData = await fetchRes.json();
      results.instance_check = {
        status: fetchRes.status,
        ok: fetchRes.ok,
        data: fetchData
      };
    } catch (e: any) {
      results.instance_check = { error: e.message };
    }

    // Test 2: Get current webhook settings
    try {
      const webhookUrl = `${baseUrl}/webhook/find/${instanceName}`;
      const webhookRes = await fetch(webhookUrl, {
        method: 'GET',
        headers: { 'apikey': apiToken },
      });
      const webhookData = await webhookRes.text();
      results.current_webhook = {
        status: webhookRes.status,
        ok: webhookRes.ok,
        data: webhookData.substring(0, 500)
      };
    } catch (e: any) {
      results.current_webhook = { error: e.message };
    }

    // Test 3: Try to set webhook with different methods
    const webhookPayloads = [
      {
        name: "webhook/set with nested webhook object",
        method: "POST",
        url: `${baseUrl}/webhook/set/${instanceName}`,
        body: {
          webhook: {
            url: webhookTargetUrl,
            enabled: true,
            webhookByEvents: false,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
          }
        }
      },
      {
        name: "webhook/set minimal",
        method: "POST",
        url: `${baseUrl}/webhook/set/${instanceName}`,
        body: {
          webhook: {
            url: webhookTargetUrl,
            enabled: true
          }
        }
      }
    ];

    for (const payload of webhookPayloads) {
      try {
        console.log(`Testing: ${payload.name} - ${payload.url}`);
        const res = await fetch(payload.url, {
          method: payload.method,
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiToken,
          },
          body: JSON.stringify(payload.body),
        });
        const text = await res.text();
        results.tests.push({
          name: payload.name,
          url: payload.url,
          method: payload.method,
          status: res.status,
          ok: res.ok,
          response: text.substring(0, 500)
        });

        // If success, stop trying
        if (res.ok) {
          results.success_method = payload.name;
          break;
        }
      } catch (e: any) {
        results.tests.push({
          name: payload.name,
          error: e.message
        });
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
