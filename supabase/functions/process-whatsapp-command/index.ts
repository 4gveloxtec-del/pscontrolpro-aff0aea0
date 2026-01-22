import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CommandResult {
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * Extrai valor de um objeto usando notação de ponto (ex: "data.credentials.login")
 */
function extractByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return obj;
  
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Formata resposta para mensagem WhatsApp
 */
function formatResponse(data: unknown): string {
  if (data === null || data === undefined) return 'Sem dados';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  
  // Objeto ou array - formata de forma legível
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map((item, i) => `${i + 1}. ${formatResponse(item)}`).join('\n');
    }
    
    const obj = data as Record<string, unknown>;
    const lines: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      if (typeof value === 'object' && value !== null) {
        lines.push(`*${label}:*\n${formatResponse(value)}`);
      } else {
        lines.push(`*${label}:* ${value}`);
      }
    }
    
    return lines.join('\n');
  }
  
  return String(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { seller_id, command_text, sender_phone, instance_name } = body;

    console.log(`[process-command] Received: "${command_text}" from ${sender_phone} for seller ${seller_id}`);

    if (!seller_id || !command_text || !sender_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Normalizar comando (lowercase, sem espaços extras)
    // O comando é armazenado COM a barra no banco (ex: /teste)
    const normalizedCommand = command_text.toLowerCase().trim().split(' ')[0];

    // Buscar comando do owner
    const { data: commandData, error: cmdError } = await supabase
      .from('whatsapp_commands')
      .select(`
        id, command, response_template, is_active,
        test_apis (
          id, api_url, api_method, api_headers, api_body_template, response_path, is_active
        )
      `)
      .eq('owner_id', seller_id)
      .eq('command', normalizedCommand)
      .eq('is_active', true)
      .maybeSingle();

    if (cmdError) {
      const errorMsg = cmdError.message || cmdError.details || JSON.stringify(cmdError);
      console.error('[process-command] DB error:', errorMsg);
      throw new Error(errorMsg);
    }

    if (!commandData) {
      console.log(`[process-command] Command not found: ${normalizedCommand}`);
      return new Response(
        JSON.stringify({ success: false, error: "Comando não encontrado", not_found: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiData = commandData.test_apis as unknown;
    const api = apiData as {
      id: string;
      api_url: string;
      api_method: string;
      api_headers: Record<string, string>;
      api_body_template: Record<string, unknown> | null;
      response_path: string | null;
      is_active: boolean;
    } | null;

    if (!api || !api.is_active) {
      console.log('[process-command] API not active');
      return new Response(
        JSON.stringify({ success: false, error: "API desativada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Executar chamada à API
    let result: CommandResult;
    let apiResponse: unknown = null;
    let apiRequest: Record<string, unknown> = { url: api.api_url, method: api.api_method };

    try {
      const fetchOptions: RequestInit = {
        method: api.api_method,
        headers: {
          'Content-Type': 'application/json',
          ...api.api_headers,
        },
      };

      if (api.api_method === 'POST' && api.api_body_template) {
        fetchOptions.body = JSON.stringify(api.api_body_template);
        apiRequest.body = api.api_body_template;
      }

      console.log(`[process-command] Calling API: ${api.api_method} ${api.api_url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(api.api_url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`[process-command] API response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`API retornou ${response.status}: ${responseText.substring(0, 200)}`);
      }

      // Tentar parsear como JSON
      try {
        apiResponse = JSON.parse(responseText);
      } catch {
        apiResponse = responseText;
      }

      // Extrair dados pelo path se configurado
      let extractedData = apiResponse;

      // If no response_path is configured, prefer common "reply" field (avoids huge JSON dumps)
      // Many chatbot APIs return a ready-to-send WhatsApp message in "reply".
      if (!api.response_path && apiResponse && typeof apiResponse === 'object') {
        const maybeReply = (apiResponse as Record<string, unknown>)['reply'];
        if (typeof maybeReply === 'string' && maybeReply.trim()) {
          extractedData = maybeReply;
        }
      } else if (api.response_path && typeof apiResponse === 'object') {
        extractedData = extractByPath(apiResponse, api.response_path);
      }

      // Formatar resposta
      const formattedResponse = formatResponse(extractedData);
      const finalMessage = commandData.response_template.replace('{response}', formattedResponse);

      result = { success: true, response: finalMessage };

    } catch (apiError: unknown) {
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
      console.error('[process-command] API call failed:', errorMessage);
      result = { success: false, error: errorMessage };
    }

    const executionTime = Date.now() - startTime;

    // Registrar log
    await supabase.from('command_logs').insert({
      owner_id: seller_id,
      command_id: commandData.id,
      command_text: normalizedCommand,
      sender_phone,
      api_request: apiRequest,
      api_response: typeof apiResponse === 'object' ? apiResponse : { raw: apiResponse },
      response_sent: result.response || null,
      success: result.success,
      error_message: result.error || null,
      execution_time_ms: executionTime,
    });

    // Atualizar contador de uso
    if (result.success) {
      await supabase
        .from('whatsapp_commands')
        .update({ usage_count: (commandData as any).usage_count + 1 || 1 })
        .eq('id', commandData.id);
    }

    console.log(`[process-command] Completed in ${executionTime}ms, success: ${result.success}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    // Handle all error types properly
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      // Handle PostgrestError and other object errors
      const errObj = error as Record<string, unknown>;
      message = errObj.message as string || errObj.error as string || errObj.details as string || JSON.stringify(error);
    }
    console.error('[process-command] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
