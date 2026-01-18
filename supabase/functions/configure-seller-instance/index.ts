import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fixed global webhook URL
const GLOBAL_WEBHOOK_URL = "https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/chatbot-webhook";

// Clean and normalize API URL
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
}

// Extract instance name from a link/URL
function extractInstanceName(input: string): string {
  const trimmed = input.trim();
  
  // If it's a URL, extract the last path segment
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').filter(p => p.length > 0);
    // Get last non-empty segment that's not 'manager' or common paths
    for (let i = parts.length - 1; i >= 0; i--) {
      const segment = parts[i].toLowerCase();
      if (!['manager', 'api', 'instance', 'connect', 'qrcode', 'http:', 'https:'].includes(segment) && 
          !segment.includes('.') && parts[i].length > 0) {
        return parts[i];
      }
    }
  }
  
  // If no URL pattern found, return as-is (just the instance name)
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
}

// Check if seller has a valid plan
async function checkSellerPlan(supabase: any, sellerId: string): Promise<{ valid: boolean; reason?: string }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_permanent, subscription_expires_at, is_active')
    .eq('id', sellerId)
    .single();

  if (error || !profile) {
    return { valid: false, reason: 'Perfil não encontrado' };
  }

  if (!profile.is_active) {
    return { valid: false, reason: 'Conta desativada' };
  }

  // Permanent users always have access
  if (profile.is_permanent) {
    return { valid: true };
  }

  // Check subscription expiration
  if (profile.subscription_expires_at) {
    const expiresAt = new Date(profile.subscription_expires_at);
    if (expiresAt > new Date()) {
      return { valid: true };
    }
    return { valid: false, reason: 'Plano vencido - renove para continuar' };
  }

  // Free trial - check if trial is still valid
  return { valid: false, reason: 'Período de teste expirado' };
}

// Configure webhook on Evolution API
async function configureWebhook(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(apiUrl);
    const webhookUrl = `${baseUrl}/webhook/set/${instanceName}`;
    
    console.log(`Configuring webhook at: ${webhookUrl}`);
    console.log(`Webhook target: ${GLOBAL_WEBHOOK_URL}`);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiToken,
      },
      body: JSON.stringify({
        url: GLOBAL_WEBHOOK_URL,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED"
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook configuration error:', response.status, errorText);
      
      // Try alternative endpoint format
      const altUrl = `${baseUrl}/instance/setWebhook/${instanceName}`;
      console.log(`Trying alternative: ${altUrl}`);
      
      const altResponse = await fetch(altUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify({
          url: GLOBAL_WEBHOOK_URL,
          enabled: true,
          events: ["MESSAGES_UPSERT"]
        }),
      });
      
      if (!altResponse.ok) {
        const altError = await altResponse.text();
        console.error('Alternative webhook configuration failed:', altError);
        return { success: false, error: `Falha ao configurar webhook: ${response.status}` };
      }
    }

    console.log('Webhook configured successfully');
    return { success: true };
  } catch (error: unknown) {
    console.error('Error configuring webhook:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Check Evolution API connection status
async function checkConnection(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(apiUrl);
    const url = `${baseUrl}/instance/connectionState/${instanceName}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': apiToken },
    });

    if (!response.ok) return false;

    const result = await response.json();
    return result?.instance?.state === 'open' || result?.state === 'open';
  } catch {
    return false;
  }
}

// Get QR Code for connection
async function getQrCode(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<{ qrcode?: string; connected?: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(apiUrl);
    
    // First check if already connected
    const isConnected = await checkConnection(apiUrl, apiToken, instanceName);
    if (isConnected) {
      return { connected: true };
    }

    // Try to get QR code
    const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
    const response = await fetch(connectUrl, {
      method: 'GET',
      headers: { 'apikey': apiToken },
    });

    if (!response.ok) {
      // Instance might not exist, try to create it
      const createUrl = `${baseUrl}/instance/create`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify({
          instanceName: instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (createResponse.ok) {
        const createResult = await createResponse.json();
        if (createResult.qrcode?.base64) return { qrcode: createResult.qrcode.base64 };
        if (createResult.base64) return { qrcode: createResult.base64 };
      }
      
      return { error: 'Não foi possível obter o QR Code' };
    }

    const result = await response.json();
    
    if (result.base64) return { qrcode: result.base64 };
    if (result.code) return { qrcode: result.code };
    if (result.qrcode?.base64) return { qrcode: result.qrcode.base64 };

    return { error: 'QR Code não disponível' };
  } catch (error: unknown) {
    return { error: (error as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, instance_link } = await req.json();

    switch (action) {
      case 'configure': {
        // 1. Check seller plan
        const planCheck = await checkSellerPlan(supabase, user.id);
        if (!planCheck.valid) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: planCheck.reason,
              blocked: true 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 2. Extract instance name from link
        const instanceName = extractInstanceName(instance_link);
        if (!instanceName || instanceName.length < 2) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Link da instância inválido. Forneça o nome ou URL completa.' 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 3. Get global Evolution API config
        const { data: globalConfig, error: configError } = await supabase
          .from('whatsapp_global_config')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (configError || !globalConfig) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'API global não configurada. Contate o administrador.' 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 4. Configure webhook on Evolution API
        const webhookResult = await configureWebhook(
          globalConfig.api_url,
          globalConfig.api_token,
          instanceName
        );

        // 5. Save or update seller instance
        const instanceData = {
          seller_id: user.id,
          instance_name: instanceName,
          instance_link: instance_link,
          webhook_auto_configured: webhookResult.success,
          auto_configured_at: webhookResult.success ? new Date().toISOString() : null,
          configuration_error: webhookResult.success ? null : webhookResult.error,
          auto_send_enabled: true,
          updated_at: new Date().toISOString(),
        };

        // Check if instance exists
        const { data: existing } = await supabase
          .from('whatsapp_seller_instances')
          .select('id')
          .eq('seller_id', user.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('whatsapp_seller_instances')
            .update(instanceData)
            .eq('id', existing.id);
        } else {
          await supabase
            .from('whatsapp_seller_instances')
            .insert({
              ...instanceData,
              is_connected: false,
              instance_blocked: false,
              plan_status: 'active',
            });
        }

        // 6. Create default chatbot settings if not exists
        const { data: existingSettings } = await supabase
          .from('chatbot_settings')
          .select('id')
          .eq('seller_id', user.id)
          .maybeSingle();

        if (!existingSettings) {
          await supabase
            .from('chatbot_settings')
            .insert({
              seller_id: user.id,
              is_enabled: true,
              ignore_groups: true,
              ignore_own_messages: true,
              typing_enabled: true,
            });
        } else {
          // Enable chatbot if it was disabled
          await supabase
            .from('chatbot_settings')
            .update({ is_enabled: true })
            .eq('seller_id', user.id);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            instance_name: instanceName,
            webhook_configured: webhookResult.success,
            message: webhookResult.success 
              ? 'Instância configurada! Agora conecte seu WhatsApp.'
              : 'Instância salva, mas o webhook precisa ser configurado manualmente.'
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_qrcode': {
        // Get seller's instance
        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('instance_name, instance_blocked')
          .eq('seller_id', user.id)
          .maybeSingle();

        if (!instance) {
          return new Response(
            JSON.stringify({ error: 'Configure sua instância primeiro' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (instance.instance_blocked) {
          return new Response(
            JSON.stringify({ error: 'Instância bloqueada. Renove seu plano.' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get global config
        const { data: globalConfig } = await supabase
          .from('whatsapp_global_config')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!globalConfig) {
          return new Response(
            JSON.stringify({ error: 'API não configurada' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const qrResult = await getQrCode(
          globalConfig.api_url,
          globalConfig.api_token,
          instance.instance_name
        );

        // Update connection status if connected
        if (qrResult.connected) {
          await supabase
            .from('whatsapp_seller_instances')
            .update({ 
              is_connected: true,
              last_connection_check: new Date().toISOString()
            })
            .eq('seller_id', user.id);
        }

        return new Response(
          JSON.stringify(qrResult),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'check_status': {
        // Get seller's instance
        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('seller_id', user.id)
          .maybeSingle();

        if (!instance) {
          return new Response(
            JSON.stringify({ configured: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get global config to check connection
        const { data: globalConfig } = await supabase
          .from('whatsapp_global_config')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        let isConnected = instance.is_connected;
        if (globalConfig && instance.instance_name) {
          isConnected = await checkConnection(
            globalConfig.api_url,
            globalConfig.api_token,
            instance.instance_name
          );

          // Update if status changed
          if (isConnected !== instance.is_connected) {
            await supabase
              .from('whatsapp_seller_instances')
              .update({ 
                is_connected: isConnected,
                last_connection_check: new Date().toISOString()
              })
              .eq('id', instance.id);
          }
        }

        return new Response(
          JSON.stringify({
            configured: true,
            instance_name: instance.instance_name,
            instance_link: instance.instance_link,
            is_connected: isConnected,
            webhook_configured: instance.webhook_auto_configured,
            blocked: instance.instance_blocked,
            auto_send_enabled: instance.auto_send_enabled,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ação desconhecida' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
