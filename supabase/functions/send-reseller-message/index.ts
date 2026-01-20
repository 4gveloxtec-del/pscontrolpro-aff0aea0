import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout constant for API calls
const API_TIMEOUT_MS = 15000;

interface SendMessageRequest {
  reseller_id: string;
  reseller_name: string;
  reseller_phone: string;
  message: string;
  template_name?: string;
}

// Clean and normalize API URL
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
}

// Format phone number for WhatsApp
function formatPhoneNumber(phone: string): string {
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.length === 11 && formattedPhone.startsWith('9')) {
    formattedPhone = '55' + formattedPhone;
  } else if (formattedPhone.length === 10 || formattedPhone.length === 11) {
    if (!formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }
  }
  return formattedPhone;
}

// Fetch with timeout wrapper
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Send message via Evolution API with retry
async function sendEvolutionMessage(
  apiUrl: string,
  apiToken: string,
  instanceName: string,
  phone: string,
  message: string,
  retries = 2
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const formattedPhone = formatPhoneNumber(phone);
      const baseUrl = normalizeApiUrl(apiUrl);
      const url = `${baseUrl}/message/sendText/${instanceName}`;
      
      console.log(`[send-reseller-message][Attempt ${attempt + 1}] Sending to ${formattedPhone} via ${url}`);
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[send-reseller-message] Evolution API error:', errorText);
        
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { success: false, error: `API Error: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      console.log('[send-reseller-message] Evolution API response:', result);
      
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      console.error(`[send-reseller-message] Error (attempt ${attempt + 1}):`, error);
      
      // Retry on timeout or network errors
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { success: false, error: errorMessage };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso restrito a administradores' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SendMessageRequest = await req.json();
    const { reseller_id, reseller_name, reseller_phone, message, template_name } = body;

    if (!reseller_id || !reseller_phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos: reseller_id, reseller_phone e message são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get global WhatsApp config
    const { data: globalConfig, error: configError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !globalConfig) {
      console.error('[send-reseller-message] No global config found:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração da API WhatsApp não encontrada ou inativa' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin's WhatsApp instance
    const { data: adminInstance, error: instanceError } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', user.id)
      .eq('is_connected', true)
      .maybeSingle();

    if (instanceError || !adminInstance) {
      console.error('[send-reseller-message] No admin instance found:', instanceError);
      return new Response(
        JSON.stringify({ success: false, error: 'Instância WhatsApp do administrador não conectada. Configure em WhatsApp Automation.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create log entry with pending status
    const { data: logEntry, error: logError } = await supabase
      .from('admin_reseller_message_logs')
      .insert({
        admin_id: user.id,
        reseller_id,
        reseller_name,
        reseller_phone,
        message_content: message,
        template_used: template_name || null,
        status: 'pending',
      })
      .select()
      .single();

    if (logError) {
      console.error('[send-reseller-message] Error creating log:', logError);
    }

    // Send message via Evolution API
    const sendResult = await sendEvolutionMessage(
      globalConfig.api_url,
      globalConfig.api_token,
      adminInstance.instance_name,
      reseller_phone,
      message
    );

    // Update log with result
    if (logEntry) {
      await supabase
        .from('admin_reseller_message_logs')
        .update({
          status: sendResult.success ? 'sent' : 'failed',
          error_message: sendResult.error || null,
          delivered_at: sendResult.success ? new Date().toISOString() : null,
        })
        .eq('id', logEntry.id);
    }

    console.log(`[send-reseller-message] Message to ${reseller_name} (${reseller_phone}): ${sendResult.success ? 'SUCCESS' : 'FAILED'}`);

    return new Response(
      JSON.stringify({
        success: sendResult.success,
        error: sendResult.error,
        log_id: logEntry?.id,
        status: sendResult.success ? 'sent' : 'failed',
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[send-reseller-message] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
