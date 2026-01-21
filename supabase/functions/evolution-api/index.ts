import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout constant for API calls
const API_TIMEOUT_MS = 15000;

// Dedupe window to prevent accidental double-sends from UI/queues
const SEND_DEDUPE_WINDOW_MS = 15_000;

interface EvolutionConfig {
  api_url: string;
  api_token: string;
  instance_name: string;
}

/**
 * Normalização robusta de telefone para Evolution API
 * Retorna formato principal e variações para retry
 */
function normalizePhoneForSend(phone: string): { digits: string; formatted: string; variations: string[] } {
  const digits = String(phone || '').replace(/\D/g, '').split('@')[0];
  let formatted = digits;

  // Remove zeros iniciais errados
  if (formatted.startsWith('550')) {
    formatted = '55' + formatted.substring(3);
  }

  // Brasil: adiciona 55 se não tiver
  if (!formatted.startsWith('55') && (formatted.length === 10 || formatted.length === 11)) {
    formatted = '55' + formatted;
  }

  // Fix: números brasileiros com 9º dígito faltando (celular)
  if (formatted.startsWith('55') && formatted.length === 12) {
    const ddd = formatted.substring(2, 4);
    const number = formatted.substring(4);
    if (!number.startsWith('9') && parseInt(ddd) >= 11) {
      formatted = `55${ddd}9${number}`;
    }
  }

  // Gerar variações para retry automático
  const variations = new Set<string>();
  variations.add(formatted);
  variations.add(`${formatted}@s.whatsapp.net`);
  
  // Sem código de país
  if (formatted.startsWith('55') && formatted.length >= 12) {
    variations.add(formatted.substring(2));
  }
  
  // Com/sem 9º dígito
  if (formatted.startsWith('55') && formatted.length === 13) {
    const without9 = formatted.substring(0, 4) + formatted.substring(5);
    variations.add(without9);
  } else if (formatted.startsWith('55') && formatted.length === 12) {
    const ddd = formatted.substring(2, 4);
    const number = formatted.substring(4);
    if (!number.startsWith('9')) {
      variations.add(`55${ddd}9${number}`);
    }
  }

  return { digits, formatted, variations: Array.from(variations) };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Clean and normalize API URL
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  // Remove /manager or /manager/ from the end if present (common mistake)
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  // Remove trailing slashes
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
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

/**
 * Envia mensagem via Evolution API com retry automático em múltiplos formatos
 * Elimina erros 400 tentando variações de número automaticamente
 */
async function sendEvolutionMessage(
  config: EvolutionConfig,
  phone: string,
  message: string,
  _retries = 2 // Mantido para compatibilidade, mas agora usamos variações
): Promise<{ success: boolean; error?: string; usedFormat?: string }> {
  const { variations } = normalizePhoneForSend(phone);
  const baseUrl = normalizeApiUrl(config.api_url);
  const url = `${baseUrl}/message/sendText/${config.instance_name}`;
  
  console.log(`[evolution-api] Sending message, will try ${variations.length} format(s)`);
  
  for (const formattedPhone of variations) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.api_token,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      });

      if (response.ok) {
        console.log(`[evolution-api] Success with format: ${formattedPhone.substring(0, 6)}***`);
        return { success: true, usedFormat: formattedPhone };
      }

      // Se não for erro 400, analisa
      if (response.status !== 400) {
        const errorText = await response.text().catch(() => '');
        
        // Erro 5xx = tenta próximo formato
        if (response.status >= 500) {
          console.log(`[evolution-api] Server error ${response.status}, trying next format...`);
          continue;
        }
        
        // Outros erros (401, 403, etc) = para imediatamente
        return { success: false, error: `API Error: ${response.status} - ${errorText.substring(0, 100)}` };
      }

      // 400 = formato errado, tenta próximo
      console.log(`[evolution-api] Format ${formattedPhone.substring(0, 6)}*** returned 400, trying next...`);
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      console.error(`[evolution-api] Network error for format ${formattedPhone.substring(0, 6)}***:`, errorMessage);
      
      // Timeout ou erro de rede = tenta próximo formato
      if (errorMessage.includes('abort') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
        continue;
      }
      
      // Outros erros = para
      return { success: false, error: errorMessage };
    }
  }
  
  console.log(`[evolution-api] All ${variations.length} formats failed`);
  return { success: false, error: 'Número não encontrado no WhatsApp (tentamos múltiplos formatos)' };
}

// Check Evolution API connection status
async function checkEvolutionConnection(config: EvolutionConfig): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(config.api_url);
    const url = `${baseUrl}/instance/connectionState/${config.instance_name}`;
    
    console.log(`Checking connection at: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': config.api_token,
      },
    });

    // Check if response is HTML (error page)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.error('API returned HTML instead of JSON. URL may be incorrect:', url);
      return false;
    }

    if (!response.ok) {
      console.log(`Connection check failed with status ${response.status}`);
      return false;
    }

    const result = await response.json();
    console.log('Connection state result:', JSON.stringify(result));
    return result?.instance?.state === 'open' || result?.state === 'open';
  } catch (error) {
    console.error('Error checking Evolution connection:', error);
    return false;
  }
}

// Get QR Code for connection
async function getEvolutionQrCode(config: EvolutionConfig): Promise<{ qrcode?: string; connected?: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(config.api_url);
    console.log(`Original URL: ${config.api_url}`);
    console.log(`Normalized URL: ${baseUrl}`);
    
    // First check if already connected
    const isConnected = await checkEvolutionConnection(config);
    if (isConnected) {
      return { connected: true };
    }

    // Try to get QR code by connecting
    const connectUrl = `${baseUrl}/instance/connect/${config.instance_name}`;
    console.log(`Getting QR code from: ${connectUrl}`);
    
    const response = await fetch(connectUrl, {
      method: 'GET',
      headers: {
        'apikey': config.api_token,
      },
    });

    console.log(`Connect response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`Connect response body: ${responseText.substring(0, 500)}`);

    // Check if response is HTML (error page)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || responseText.startsWith('<!')) {
      console.error('API returned HTML instead of JSON');
      
      // Try alternate URL structures for different Evolution API setups
      const altUrls = [
        `${config.api_url.replace(/\/$/, '')}/instance/connect/${config.instance_name}`,
        `${baseUrl}/api/instance/connect/${config.instance_name}`,
      ];
      
      for (const altUrl of altUrls) {
        console.log(`Trying alternate URL: ${altUrl}`);
        const altResponse = await fetch(altUrl, {
          method: 'GET',
          headers: { 'apikey': config.api_token },
        });
        
        if (altResponse.ok) {
          const altContentType = altResponse.headers.get('content-type') || '';
          if (altContentType.includes('application/json')) {
            const altResult = await altResponse.json();
            console.log(`Alternate URL worked:`, JSON.stringify(altResult));
            if (altResult.base64 || altResult.code || altResult.qrcode?.base64) {
              return { qrcode: altResult.base64 || altResult.code || altResult.qrcode?.base64 };
            }
          }
        }
      }
      
      return { error: 'URL da API incorreta. Verifique se a URL aponta para a API Evolution (não o painel manager).' };
    }

    // Try to parse JSON response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { error: `Resposta inválida da API: ${responseText.substring(0, 100)}` };
    }
    
    console.log('QR code result:', JSON.stringify(result));
    
    // Check various response formats from Evolution API
    if (result.base64) return { qrcode: result.base64 };
    if (result.code) return { qrcode: result.code };
    if (result.qrcode?.base64) return { qrcode: result.qrcode.base64 };
    if (result.pairingCode) return { qrcode: result.pairingCode };

    // If 404 or instance doesn't exist, try to create it
    if (!response.ok || result.error || result.message?.includes('not found')) {
      console.log('Instance may not exist, trying to create...');
      
      const createUrl = `${baseUrl}/instance/create`;
      console.log(`Creating instance at: ${createUrl}`);
      
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.api_token,
        },
        body: JSON.stringify({
          instanceName: config.instance_name,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      const createText = await createResponse.text();
      console.log(`Create response status: ${createResponse.status}`);
      console.log(`Create response body: ${createText.substring(0, 500)}`);

      // Check for HTML response
      if (createText.startsWith('<!') || createText.startsWith('<html')) {
        return { error: 'URL da API incorreta. Configure a URL base da API Evolution.' };
      }

      try {
        const createResult = JSON.parse(createText);
        console.log('Instance creation result:', JSON.stringify(createResult));
        
        if (createResult.qrcode?.base64) return { qrcode: createResult.qrcode.base64 };
        if (createResult.base64) return { qrcode: createResult.base64 };
        if (createResult.code) return { qrcode: createResult.code };
        
        // If instance was created successfully, try to connect again
        if (createResult.instance || createResponse.ok) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const retryResponse = await fetch(connectUrl, {
            method: 'GET',
            headers: { 'apikey': config.api_token },
          });
          
          if (retryResponse.ok) {
            const retryResult = await retryResponse.json();
            if (retryResult.base64 || retryResult.code) {
              return { qrcode: retryResult.base64 || retryResult.code };
            }
          }
        }
      } catch {
        return { error: `Erro ao criar instância: ${createText.substring(0, 100)}` };
      }

      return { error: 'Falha ao obter QR code após criar instância.' };
    }

    return { error: 'QR code não disponível. Tente novamente.' };
  } catch (error) {
    console.error('Error getting QR code:', error);
    return { error: (error as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body once and extract all fields
    const body = await req.json();
    const { action, userId, phone, message, config, messages } = body;

    // ============================================================
    // Security guards (Etapa 2): owner validation + connected checks
    // - Ensures a user can only operate on their own instance
    // - Ensures sends only happen when instance is CONNECTED
    // - Adds clear log tags: [ADMIN][instance] / [SELLER][instance]
    // ============================================================

    const normalizeInstance = (v: unknown) => String(v || '').trim();

    const getDedupeKey = async (instanceName: string, phoneValue: string, messageValue: string) => {
      const { formatted } = normalizePhoneForSend(phoneValue);
      const inst = normalizeInstance(instanceName);
      // include instance + destination + message (prevents false positives)
      return sha256Hex(`${inst}::${formatted}::${messageValue}`);
    };

    const isRecentDuplicateSend = async (sellerId: string, instanceName: string, phoneValue: string, messageValue: string) => {
      const inst = normalizeInstance(instanceName);
      const { formatted, digits } = normalizePhoneForSend(phoneValue);
      const dedupeKey = await getDedupeKey(inst, phoneValue, messageValue);
      const since = new Date(Date.now() - SEND_DEDUPE_WINDOW_MS).toISOString();

      // We store the dedupeKey in chatbot_send_logs.api_response (string) to avoid schema changes.
      // This keeps dedupe state server-side without creating new tables.
      const { data: recent } = await supabase
        .from('chatbot_send_logs')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('instance_name', inst)
        .eq('message_type', 'manual')
        .eq('api_response', dedupeKey)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Extra safety: some callers may pass phone without country code
      if (!recent?.id && digits !== formatted) {
        const { data: recentAlt } = await supabase
          .from('chatbot_send_logs')
          .select('id')
          .eq('seller_id', sellerId)
          .eq('instance_name', inst)
          .eq('message_type', 'manual')
          .eq('api_response', dedupeKey)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { isDup: !!recentAlt?.id, dedupeKey, formattedPhone: formatted };
      }

      return { isDup: !!recent?.id, dedupeKey, formattedPhone: formatted };
    };

    const getIsAdmin = async (uid: string): Promise<boolean> => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .eq('role', 'admin')
        .maybeSingle();
      return !!data;
    };

    const validateOwnershipAndGetTag = async (
      uid: string | undefined,
      requestedInstanceName: string
    ): Promise<{ ok: boolean; tag: string; reason?: string }> => {
      const inst = normalizeInstance(requestedInstanceName);
      if (!uid) return { ok: false, tag: `[UNKNOWN][${inst || 'no_instance'}]`, reason: 'Missing userId' };
      if (!inst) return { ok: false, tag: `[UNKNOWN][no_instance]`, reason: 'Missing instance_name' };

      const isAdmin = await getIsAdmin(uid);
      const tag = `${isAdmin ? '[ADMIN]' : '[SELLER]'}[${inst}]`;

      if (isAdmin) {
        const { data: globalCfg } = await supabase
          .from('whatsapp_global_config')
          .select('admin_user_id, instance_name, is_active')
          .eq('is_active', true)
          .maybeSingle();

        const expectedAdminId = globalCfg?.admin_user_id ? String(globalCfg.admin_user_id) : '';
        const expectedInstance = globalCfg?.instance_name ? String(globalCfg.instance_name).trim() : '';

        if (!expectedAdminId || expectedAdminId !== uid) {
          return { ok: false, tag, reason: 'Admin owner_id mismatch' };
        }

        if (expectedInstance && expectedInstance.toLowerCase() !== inst.toLowerCase()) {
          return { ok: false, tag, reason: `Admin instance mismatch (expected ${expectedInstance})` };
        }

        return { ok: true, tag };
      }

      // seller
      const { data: instanceRow } = await supabase
        .from('whatsapp_seller_instances')
        .select('seller_id, instance_name')
        .eq('seller_id', uid)
        .maybeSingle();

      if (!instanceRow) return { ok: false, tag, reason: 'Seller instance not found' };

      const expected = normalizeInstance(instanceRow.instance_name);
      if (expected && expected.toLowerCase() !== inst.toLowerCase()) {
        return { ok: false, tag, reason: `Seller instance mismatch (expected ${expected})` };
      }

      return { ok: true, tag };
    };

    const validateConnectedForSend = async (
      uid: string,
      requestedInstanceName: string
    ): Promise<{ ok: boolean; reason?: string }> => {
      const inst = normalizeInstance(requestedInstanceName);
      const { data: row } = await supabase
        .from('whatsapp_seller_instances')
        .select('seller_id, instance_name, is_connected, instance_blocked')
        .eq('seller_id', uid)
        .maybeSingle();

      if (!row) return { ok: false, reason: 'Instance not found' };
      if (row.instance_blocked) return { ok: false, reason: 'Instance blocked' };
      if (!row.is_connected) return { ok: false, reason: 'Instance not connected' };

      const expected = normalizeInstance(row.instance_name);
      if (expected && inst && expected.toLowerCase() !== inst.toLowerCase()) {
        return { ok: false, reason: `Instance mismatch (expected ${expected})` };
      }
      return { ok: true };
    };

    // Check if seller's instance is blocked (for actions that send messages)
    const checkBlockedInstance = async (sellerId: string): Promise<{ blocked: boolean; reason?: string }> => {
      if (!sellerId) return { blocked: false };
      
      try {
        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('instance_blocked, blocked_reason')
          .eq('seller_id', sellerId)
          .maybeSingle();
        
        if (instance?.instance_blocked) {
          return { blocked: true, reason: instance.blocked_reason || 'Instância bloqueada por inadimplência' };
        }
      } catch (e) {
        console.error('Error checking blocked instance:', e);
      }
      return { blocked: false };
    };

    switch (action) {
      case 'check_connection': {
        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ connected: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Ownership validation (prevents cross-instance checks)
        const ownerCheck = await validateOwnershipAndGetTag(userId, config?.instance_name);
        if (!ownerCheck.ok) {
          console.log(`${ownerCheck.tag} Ignored check_connection: ${ownerCheck.reason}`);
          return new Response(
            JSON.stringify({ connected: false, error: ownerCheck.reason }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`${ownerCheck.tag} check_connection requested`);

        const isConnected = await checkEvolutionConnection(config);
        
        // Update connection status in seller instances table if userId provided
        if (userId) {
          await supabase
            .from('whatsapp_seller_instances')
            .update({ 
              is_connected: isConnected, 
              last_connection_check: new Date().toISOString() 
            })
            .eq('seller_id', userId);
        }

        return new Response(
          JSON.stringify({ connected: isConnected }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_qrcode': {
        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Ownership validation (prevents cross-instance QR fetch)
        const ownerCheck = await validateOwnershipAndGetTag(userId, config?.instance_name);
        if (!ownerCheck.ok) {
          console.log(`${ownerCheck.tag} Ignored get_qrcode: ${ownerCheck.reason}`);
          return new Response(
            JSON.stringify({ error: ownerCheck.reason }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`${ownerCheck.tag} get_qrcode requested`);

        const result = await getEvolutionQrCode(config);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'send_message': {
        const ownerCheck = await validateOwnershipAndGetTag(userId, config?.instance_name);
        if (!ownerCheck.ok) {
          console.log(`${ownerCheck.tag} Blocked send_message: ${ownerCheck.reason}`);
          return new Response(
            JSON.stringify({ success: false, error: ownerCheck.reason }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isAdminSender = userId ? await getIsAdmin(userId) : false;

        // Check if instance is blocked
        if (userId && !isAdminSender) {
          const blockCheck = await checkBlockedInstance(userId);
          if (blockCheck.blocked) {
            return new Response(
              JSON.stringify({ success: false, blocked: true, error: blockCheck.reason }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Must be CONNECTED before sending
        if (userId && !isAdminSender) {
          const connectedCheck = await validateConnectedForSend(userId, config?.instance_name);
          if (!connectedCheck.ok) {
            console.log(`${ownerCheck.tag} Blocked send_message: ${connectedCheck.reason}`);
            return new Response(
              JSON.stringify({ success: false, error: connectedCheck.reason }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!phone || !message) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing phone or message' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Dedupe: prevent double-send for the exact same (instance + phone + message)
        if (userId && config?.instance_name) {
          const dedupe = await isRecentDuplicateSend(userId, config.instance_name, phone, message);
          if (dedupe.isDup) {
            console.log(`${ownerCheck.tag} Dedupe hit (send_message) phone=${dedupe.formattedPhone}`);
            return new Response(
              JSON.stringify({ success: true, deduped: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        console.log(`${ownerCheck.tag} Sending message to ${String(phone || '').replace(/\D/g, '')}`);
        const result = await sendEvolutionMessage(config, phone, message);

        // Persist a lightweight send record for dedupe (no schema changes)
        if (userId && config?.instance_name) {
          try {
            const dedupeKey = await getDedupeKey(config.instance_name, phone, message);
            const { formatted } = normalizePhoneForSend(phone);
            await supabase.from('chatbot_send_logs').insert({
              seller_id: userId,
              instance_name: normalizeInstance(config.instance_name),
              contact_phone: formatted,
              message_type: 'manual',
              success: !!result.success,
              api_response: dedupeKey,
              error_message: result.success ? null : (result as any).error || 'send failed',
            });
          } catch (e) {
            console.error(`${ownerCheck.tag} Failed to write dedupe log:`, e);
          }
        }
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'send_bulk': {
        const ownerCheck = await validateOwnershipAndGetTag(userId, config?.instance_name);
        if (!ownerCheck.ok) {
          console.log(`${ownerCheck.tag} Blocked send_bulk: ${ownerCheck.reason}`);
          return new Response(
            JSON.stringify({ success: false, error: ownerCheck.reason }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isAdminSender = userId ? await getIsAdmin(userId) : false;

        // Check if instance is blocked for bulk messages too
        if (userId && !isAdminSender) {
          const blockCheck = await checkBlockedInstance(userId);
          if (blockCheck.blocked) {
            return new Response(
              JSON.stringify({ success: false, blocked: true, error: blockCheck.reason }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Must be CONNECTED before sending bulk
        if (userId && !isAdminSender) {
          const connectedCheck = await validateConnectedForSend(userId, config?.instance_name);
          if (!connectedCheck.ok) {
            console.log(`${ownerCheck.tag} Blocked send_bulk: ${connectedCheck.reason}`);
            return new Response(
              JSON.stringify({ success: false, error: connectedCheck.reason }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Use messages from the already-parsed body (FIXED: no double parse)
        if (!messages || !Array.isArray(messages)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing messages array' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`${ownerCheck.tag} Sending bulk messages: count=${messages?.length || 0}`);

        const results = [];
        for (const msg of messages) {
          // Dedupe per item
          if (userId && config?.instance_name && msg?.phone && msg?.message) {
            const dedupe = await isRecentDuplicateSend(userId, config.instance_name, msg.phone, msg.message);
            if (dedupe.isDup) {
              console.log(`${ownerCheck.tag} Dedupe hit (send_bulk) phone=${dedupe.formattedPhone}`);
              results.push({ phone: msg.phone, success: true, deduped: true });
              continue;
            }
          }

          // Add delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500));
          const result = await sendEvolutionMessage(config, msg.phone, msg.message);

          // Persist dedupe marker regardless of success
          if (userId && config?.instance_name && msg?.phone && msg?.message) {
            try {
              const dedupeKey = await getDedupeKey(config.instance_name, msg.phone, msg.message);
              const { formatted } = normalizePhoneForSend(msg.phone);
              await supabase.from('chatbot_send_logs').insert({
                seller_id: userId,
                instance_name: normalizeInstance(config.instance_name),
                contact_phone: formatted,
                message_type: 'manual',
                success: !!result.success,
                api_response: dedupeKey,
                error_message: result.success ? null : (result as any).error || 'send failed',
              });
            } catch (e) {
              console.error(`${ownerCheck.tag} Failed to write dedupe log (bulk item):`, e);
            }
          }

          results.push({ phone: msg.phone, ...result });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            results,
            sent: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
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
