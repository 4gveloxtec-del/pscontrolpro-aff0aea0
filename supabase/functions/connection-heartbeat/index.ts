import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default renewal keywords
const DEFAULT_RENEWAL_KEYWORDS = ['renovado', 'renovação', 'renovacao', 'renewed', 'prorrogado', 'estendido', 'renovou', 'extensão'];

/**
 * Detecta se uma mensagem enviada é de renovação e sincroniza o cliente no app
 * SEM enviar notificação duplicada (a API do servidor já enviou)
 */
async function detectAndSyncRenewal(
  supabase: SupabaseClient,
  sellerId: string,
  clientPhone: string,
  messageText: string
): Promise<void> {
  if (!messageText || messageText.length < 10) return;
  
  try {
    // Buscar configuração de integração do seller
    const { data: config } = await supabase
      .from('test_integration_config')
      .select('detect_renewal_enabled, detect_renewal_keywords')
      .eq('seller_id', sellerId)
      .eq('is_active', true)
      .maybeSingle();
    
    // Se não tem config ou detecção desabilitada, ignorar
    if (!config?.detect_renewal_enabled) {
      return;
    }
    
    // Usar keywords configuradas ou padrão
    const keywords: string[] = config?.detect_renewal_keywords && Array.isArray(config.detect_renewal_keywords)
      ? config.detect_renewal_keywords
      : DEFAULT_RENEWAL_KEYWORDS;
    
    const lowerMessage = messageText.toLowerCase();
    
    // Verificar se contém alguma keyword de renovação
    const hasRenewalKeyword = keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
    
    if (!hasRenewalKeyword) {
      return; // Não é mensagem de renovação
    }
    
    console.log(`[Webhook] Renewal message detected for phone ${clientPhone}: "${messageText.substring(0, 100)}..."`);
    
    // Chamar função de sincronização de renovação
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-client-renewal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        seller_id: sellerId,
        client_phone: clientPhone,
        message_content: messageText,
        source: 'message_detection',
      }),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`[Webhook] Renewal sync result:`, JSON.stringify(result));
    } else {
      console.error(`[Webhook] Renewal sync failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[Webhook] Error detecting renewal:', error);
  }
}

// Evolution API may send event names as UPPER_SNAKE (e.g. MESSAGES_UPSERT)
// while our internal switch expects dot-lowercase (e.g. messages.upsert).
function normalizeWebhookEvent(raw: unknown): string {
  const e = String(raw || "").trim();
  if (!e) return "";

  const lower = e.toLowerCase();

  // Already in dot format
  if (lower.includes(".")) return lower;

  // Common Evolution event naming patterns
  const key = lower.replace(/\s+/g, "").replace(/-/g, "_");
  const map: Record<string, string> = {
    messages_upsert: "messages.upsert",
    connection_update: "connection.update",
    qrcode_updated: "qrcode.updated",
    instance_ready: "instance.ready",
    connection_lost: "connection.lost",
    logout: "logout",
  };

  if (map[key]) return map[key];

  // Fallback: convert snake_case to dot.case
  return key.replace(/_/g, ".");
}

// WhatsApp messages can be wrapped (ephemeral/viewOnce) depending on chat settings.
// This helper unwraps common containers so we can reliably read text/captions.
function unwrapWhatsAppMessage(message: any): any {
  if (!message || typeof message !== 'object') return message;

  return (
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.viewOnceMessageV2Extension?.message ||
    message?.documentWithCaptionMessage?.message ||
    message
  );
}

function extractWhatsAppMessageText(msg: any): string {
  // Try unwrapping msg.message first (standard structure)
  const unwrapped = unwrapWhatsAppMessage(msg?.message);
  
  // Also try unwrapping msg directly (some Evolution payloads put content at root)
  const unwrappedDirect = unwrapWhatsAppMessage(msg);

  const text =
    // Standard nested structure: msg.message.conversation
    unwrapped?.conversation ||
    unwrapped?.extendedTextMessage?.text ||
    // Direct structure: msg.conversation (seen in some Evolution payloads)
    unwrappedDirect?.conversation ||
    unwrappedDirect?.extendedTextMessage?.text ||
    // Media captions (nested)
    unwrapped?.imageMessage?.caption ||
    unwrapped?.videoMessage?.caption ||
    unwrapped?.documentMessage?.caption ||
    // Media captions (direct)
    unwrappedDirect?.imageMessage?.caption ||
    unwrappedDirect?.videoMessage?.caption ||
    unwrappedDirect?.documentMessage?.caption ||
    // Interactive responses (nested)
    unwrapped?.buttonsResponseMessage?.selectedDisplayText ||
    unwrapped?.buttonsResponseMessage?.selectedButtonId ||
    unwrapped?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    unwrapped?.listResponseMessage?.title ||
    unwrapped?.templateButtonReplyMessage?.selectedDisplayText ||
    unwrapped?.templateButtonReplyMessage?.selectedId ||
    // Interactive responses (direct)
    unwrappedDirect?.buttonsResponseMessage?.selectedDisplayText ||
    unwrappedDirect?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    // Common alternative payload fields from Evolution
    msg?.messageBody ||
    msg?.body ||
    msg?.text ||
    (typeof msg?.message === 'string' ? msg.message : '') ||
    // Last resort: check if conversation is directly on msg (without unwrap)
    msg?.conversation ||
    '';

  return String(text || '');
}

// Try to extract a real phone number from various WhatsApp/Evolution fields.
// Some payloads use @lid identifiers; in those cases the real number may appear in
// participantAlt or in the webhook-level `sender` field.
function normalizeJidToPhone(jid: string): string {
  if (!jid) return '';

  // Some providers append extra device/session markers like ":1234" before the suffix.
  // Also, some payloads may still include the suffix even when the real number is present.
  const beforeColon = String(jid).split(':')[0];
  const raw = beforeColon
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@lid', '')
    .replace('@g.us', '');
  
  // Validate it looks like a phone number (E.164 digits only, 10-15 digits).
  // IMPORTANT: Some Evolution/WhatsApp payloads can carry a real phone even when suffix is "@lid".
  // So we validate by digits length/pattern instead of hard-rejecting @lid.
  const digits = String(raw).replace(/\D/g, '');
  
  // Phone numbers should be 10-15 digits (with country code)
  // LIDs are typically longer or have unusual patterns
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  
  return '';
}

/**
 * CRITICAL FUNCTION: Extract the REAL sender phone from webhook payload
 * 
 * The problem: Evolution API can send different fields depending on:
 * - Message direction (fromMe: true/false)
 * - Chat type (individual vs group)
 * - API version
 * 
 * For RECEIVED messages (fromMe=false):
 * - remoteJid contains the CLIENT's phone (who sent the message)
 * - This is where we need to send the RESPONSE
 * 
 * For SENT messages (fromMe=true):
 * - remoteJid contains the RECIPIENT's phone
 * - sender might be our own number (the instance)
 * 
 * IMPORTANT: We must NEVER return the instance's own phone number
 * when processing received commands, or the bot will respond to itself!
 */
function getSenderPhoneFromWebhook(
  msg: any, 
  eventData: any, 
  body: any,
  instancePhone?: string // Phone number of the connected instance (to avoid)
): string {
  const remoteJid = String(msg?.key?.remoteJid || msg?.remoteJid || '');
  const isGroupChat = remoteJid.includes('@g.us');
  const isFromMe = msg?.key?.fromMe === true;

  // =====================================================================
  // CRITICAL FIX: In WhatsApp/Evolution API:
  // - For RECEIVED messages (fromMe=false): remoteJid contains the SENDER's number
  // - For SENT messages (fromMe=true): remoteJid contains the RECIPIENT's number
  // - For GROUP messages: remoteJid is the group ID, sender is in participant/participantAlt
  // =====================================================================
  
  let candidates: string[] = [];

  // Helper: always try to trust remoteJid first for RECEIVED 1:1 messages.
  // This is the most reliable field across Evolution/Baileys formats.
  if (!isGroupChat && !isFromMe) {
    const remotePhone = normalizeJidToPhone(remoteJid);
    if (remotePhone && (!instancePhone || remotePhone !== instancePhone)) {
      console.log(`[getSenderPhone] Using remoteJid as sender: ${remotePhone}`);
      return remotePhone;
    }
  }

  if (isGroupChat) {
    // In groups, we always need participant/participantAlt for the actual sender
    candidates = [
      msg?.key?.participantAlt,
      msg?.participantAlt,
      msg?.key?.participant,
      msg?.participant,
      eventData?.sender,
      body?.sender,
    ];
  } else if (isFromMe) {
    // SENT messages: remoteJid is the RECIPIENT (the person we're sending TO)
    candidates = [
      msg?.key?.remoteJid,
      msg?.remoteJid,
    ];
  } else {
    // =====================================================================
    // RECEIVED messages (commands come here): 
    // remoteJid is the SENDER (the CLIENT who sent us the message)
    // This is where we need to send the RESPONSE
    // =====================================================================
    candidates = [
      // Message-level identifiers (most reliable)
      msg?.key?.remoteJid,
      msg?.remoteJid,
      msg?.key?.participantAlt,
      msg?.participantAlt,
      msg?.key?.participant,
      msg?.participant,
      // Event/body-level fallbacks (varies by Evolution version)
      eventData?.key?.remoteJid,
      eventData?.remoteJid,
      eventData?.message?.key?.remoteJid,
      body?.data?.key?.remoteJid,
      body?.data?.message?.key?.remoteJid,
      body?.from,
      eventData?.from,
      // Last resort: webhook-level sender (can be the instance phone in some formats)
      eventData?.sender,
      body?.sender,
    ];
  }

  // Log candidates for debugging
  console.log(`[getSenderPhone] fromMe=${isFromMe}, isGroup=${isGroupChat}, remoteJid=${remoteJid.substring(0, 30)}`);
  console.log(`[getSenderPhone] instancePhone to avoid: ${instancePhone || 'not provided'}`);
  console.log(`[getSenderPhone] candidates:`, candidates.filter(Boolean).map(c => String(c).substring(0, 30)));

  // Try to find a phone that is NOT the instance's phone
  for (const c of candidates.filter(Boolean)) {
    const phone = normalizeJidToPhone(String(c));
    if (phone) {
      // If we have instancePhone, skip if it matches
      if (instancePhone && phone === instancePhone) {
        console.log(`[getSenderPhone] Skipping candidate ${phone} - matches instance phone`);
        continue;
      }
      console.log(`[getSenderPhone] Extracted phone: ${phone} from candidate: ${String(c).substring(0, 30)}`);
      return phone;
    }
  }

  console.log(`[getSenderPhone] FAILED to extract phone from any candidate`);
  return '';
}

// Normalize API URL
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, '');
  cleanUrl = cleanUrl.replace(/\/+$/, '');
  return cleanUrl;
}

// Check Evolution API connection status with retry - returns phone number when connected
async function checkEvolutionConnection(
  apiUrl: string,
  apiToken: string,
  instanceName: string,
  retries = 2
): Promise<{ connected: boolean; state?: string; error?: string; phone?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const baseUrl = normalizeApiUrl(apiUrl);
      
      // Use fetchInstances endpoint which returns owner/phone info
      const url = `${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'apikey': apiToken },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { connected: false, error: `API error: ${response.status}`, state: 'error' };
      }

      const result = await response.json();
      
      // fetchInstances returns array of instances
      const instanceData = Array.isArray(result) ? result[0] : result;
      
      if (!instanceData) {
        return { connected: false, error: 'Instance not found', state: 'not_found' };
      }
      
      // Get connection state - check both possible formats
      const state = instanceData?.connectionStatus || instanceData?.instance?.state || 'unknown';
      const isConnected = state === 'open';
      
      // Extract phone number from ownerJid (format: 5511999999999@s.whatsapp.net)
      let phone: string | undefined;
      const ownerJid = instanceData?.ownerJid || instanceData?.owner || instanceData?.instance?.owner;
      if (ownerJid) {
        phone = ownerJid.replace(/@.*$/, '');
      }
      
      console.log(`[checkEvolutionConnection] Instance: ${instanceName}, State: ${state}, Phone: ${phone || 'not available'}`);
      
      return { connected: isConnected, state, phone };
    } catch (error: any) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { connected: false, error: error.message, state: 'error' };
    }
  }
  return { connected: false, error: 'Max retries exceeded', state: 'error' };
}

// Attempt to reconnect without QR code (restart instance) - with timeout
async function attemptReconnect(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<{ success: boolean; needsQR: boolean; error?: string }> {
  const RECONNECT_TIMEOUT_MS = 15000;
  
  try {
    const baseUrl = normalizeApiUrl(apiUrl);
    
    // First, try to restart the instance with timeout
    const restartUrl = `${baseUrl}/instance/restart/${instanceName}`;
    
    const restartController = new AbortController();
    const restartTimeoutId = setTimeout(() => restartController.abort(), RECONNECT_TIMEOUT_MS);
    
    try {
      const restartResponse = await fetch(restartUrl, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': apiToken 
        },
        signal: restartController.signal,
      });
      
      clearTimeout(restartTimeoutId);

      if (restartResponse.ok) {
        // Wait a bit and check connection
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const checkResult = await checkEvolutionConnection(apiUrl, apiToken, instanceName);
        if (checkResult.connected) {
          return { success: true, needsQR: false };
        }
      }
    } catch (restartError: any) {
      clearTimeout(restartTimeoutId);
      if (restartError.name === 'AbortError') {
        console.log('[attemptReconnect] Restart request timed out');
      }
      // Continue to try connect endpoint
    }

    // If restart didn't work, check if we need a new QR - with timeout
    const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
    
    const connectController = new AbortController();
    const connectTimeoutId = setTimeout(() => connectController.abort(), RECONNECT_TIMEOUT_MS);
    
    try {
      const connectResponse = await fetch(connectUrl, {
        method: 'GET',
        headers: { 'apikey': apiToken },
        signal: connectController.signal,
      });
      
      clearTimeout(connectTimeoutId);

      if (connectResponse.ok) {
        const result = await connectResponse.json();
        // If we got a QR code back, session is invalid
        if (result.base64 || result.code || result.qrcode) {
          return { success: false, needsQR: true };
        }
      }
    } catch (connectError: any) {
      clearTimeout(connectTimeoutId);
      if (connectError.name === 'AbortError') {
        return { success: false, needsQR: false, error: 'Connection check timed out' };
      }
    }

    return { success: false, needsQR: false, error: 'Reconnection failed' };
  } catch (error) {
    return { success: false, needsQR: false, error: (error as Error).message };
  }
}

// Retry delays in milliseconds (progressive: 30s, 1min, 3min, 5min, 10min)
const RETRY_DELAYS = [30000, 60000, 180000, 300000, 600000];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    
    // Health check ping
    if (url.searchParams.get("ping") === "true") {
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          service: "connection-heartbeat",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NOTE: Some webhook providers may send JSON with unexpected headers; parse from text for robustness.
    const rawText = await req.text().catch(() => "");
    let body: any = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = {};
    }

    const { action, seller_id, webhook_event } = body;

    // ============================================================
    // WEBHOOK HANDLER - Receive events from Evolution API
    // IMPORTANT: Evolution sends webhooks with { event, instance, data } (no action/webhook_event)
    // ============================================================
    const isWebhookRequest = action === 'webhook' || !!webhook_event || !!(body && typeof body === 'object' && 'event' in body);

    if (isWebhookRequest) {
      // Log full payload for debugging - ENHANCED
      const fullPayloadStr = JSON.stringify(body);
      console.log('[Webhook] ===== INCOMING WEBHOOK =====');
      console.log('[Webhook] Raw payload length:', fullPayloadStr.length);
      console.log('[Webhook] Raw payload (first 3000 chars):', fullPayloadStr.substring(0, 3000));
      
      const rawEvent = webhook_event || body.event;
      const event = normalizeWebhookEvent(rawEvent);
      
      // Enhanced instance name extraction - handle ALL possible Evolution API formats
      const instanceName = 
        body.instance || 
        body.instance?.instanceName ||
        body.instance?.name ||
        body.data?.instance?.instanceName ||
        body.data?.instance?.name ||
        body.data?.instance ||
        body.instanceName ||
        body.sender?.instance ||
        body.apikey?.instanceName ||
        body.server?.instanceName ||
        (typeof body.data?.key?.remoteJid === 'string' ? body.instance : null) ||
        // Evolution API v2 format variations
        body.data?.instanceName ||
        body.destination?.instanceName ||
        body.source?.instance;
      
      const eventData = body.data || body;
      
      console.log('[Webhook] Parsed - rawEvent:', rawEvent || 'NOT_SET', '=>', event || 'EMPTY');
      console.log('[Webhook] Parsed - instanceName:', instanceName || 'NOT_FOUND');
      console.log('[Webhook] Available keys:', Object.keys(body).join(', '));
      if (body.data) {
        console.log('[Webhook] body.data keys:', Object.keys(body.data).join(', '));
      }
      
      if (!instanceName) {
        console.error('[Webhook] CRITICAL: Could not extract instance name from payload!');
        console.error('[Webhook] Full body structure:', JSON.stringify(body, null, 2).substring(0, 1500));
        return new Response(
          JSON.stringify({ error: 'Instance name required', received_keys: Object.keys(body) }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find seller by instance name - robust multi-step search
      const normalizedInstanceName = instanceName.trim().toLowerCase();
      console.log(`[Webhook] Looking for instance: "${instanceName}" (normalized: "${normalizedInstanceName}")`);
      
      let instance = null;
      
      // Strategy 1: Exact match on instance_name
      const { data: inst1 } = await supabase
        .from('whatsapp_seller_instances')
        .select('seller_id, instance_name, is_connected, connected_phone, last_evolution_state')
        .eq('instance_name', instanceName)
        .maybeSingle();
      
      if (inst1) {
        instance = inst1;
        console.log(`[Webhook] ✓ Found by exact instance_name match`);
      } else {
        // Strategy 2: Case-insensitive match on instance_name
        const { data: inst2 } = await supabase
          .from('whatsapp_seller_instances')
          .select('seller_id, instance_name, is_connected, connected_phone, last_evolution_state')
          .ilike('instance_name', instanceName)
          .maybeSingle();
        
        if (inst2) {
          instance = inst2;
          console.log(`[Webhook] ✓ Found by case-insensitive instance_name match`);
        } else {
          // Strategy 3: Exact match on original_instance_name
          const { data: inst3 } = await supabase
            .from('whatsapp_seller_instances')
            .select('seller_id, instance_name, is_connected, connected_phone, last_evolution_state')
            .eq('original_instance_name', instanceName)
            .maybeSingle();
          
          if (inst3) {
            instance = inst3;
            console.log(`[Webhook] ✓ Found by original_instance_name match`);
          } else {
            // Strategy 4: Case-insensitive match on original_instance_name
            const { data: inst4 } = await supabase
              .from('whatsapp_seller_instances')
              .select('seller_id, instance_name, is_connected, connected_phone, last_evolution_state')
              .ilike('original_instance_name', instanceName)
              .maybeSingle();
            
            if (inst4) {
              instance = inst4;
              console.log(`[Webhook] ✓ Found by case-insensitive original_instance_name match`);
            } else {
              // Strategy 5: Partial match (contains) - last resort
              const { data: inst5 } = await supabase
                .from('whatsapp_seller_instances')
                .select('seller_id, instance_name, is_connected, connected_phone, last_evolution_state')
                .or(`instance_name.ilike.%${normalizedInstanceName}%,original_instance_name.ilike.%${normalizedInstanceName}%`)
                .limit(1)
                .maybeSingle();
              
              if (inst5) {
                instance = inst5;
                console.log(`[Webhook] ✓ Found by partial match (contains)`);
              }
            }
          }
        }
      }

      if (!instance) {
        console.log(`[Webhook] ✗ Instance not found for: "${instanceName}" after all strategies`);
        return new Response(
          JSON.stringify({ error: 'Instance not found', instance_name: instanceName, searched_strategies: ['exact', 'ilike', 'original', 'original_ilike', 'partial'] }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[Webhook] Found seller_id: ${instance.seller_id} for instance: ${instanceName}`);

      // -------- LOG ALL INCOMING WEBHOOK EVENTS FOR DEBUGGING --------
      try {
        await supabase.from('connection_logs').insert({
          seller_id: instance.seller_id,
          instance_name: instanceName,
          event_type: event || 'unknown',
          event_source: 'evolution_webhook',
          is_connected: instance.is_connected,
          metadata: { raw_event: rawEvent, keys: Object.keys(body) },
        });
      } catch (logErr) {
        console.error('[Webhook] Failed to log event:', logErr);
      }
      // ----------------------------------------------------------------

      // Handle different webhook events
      let newConnectionState = instance.is_connected;
      let sessionValid = true;
      let alertType: string | null = null;
      let alertMessage = '';

      // Verificar se última ação foi logout manual - ignorar reconexões automáticas
      const lastState = instance.last_evolution_state;
      const isManualLogout = lastState === 'logout_manual' || lastState === 'logout_failed' || lastState === 'force_deleted';
      
      switch (event) {
        case 'connection.update':
          const state = eventData.state || eventData.connection?.state;
          const wouldReconnect = state === 'open';
          
          // Ignorar reconexão automática após logout manual
          if (isManualLogout && wouldReconnect) {
            console.log(`[Webhook] Ignoring auto-reconnect after manual logout for ${instance.instance_name}`);
            return new Response(
              JSON.stringify({ 
                success: true, 
                message: 'Ignored auto-reconnect after manual logout',
                last_state: lastState
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          newConnectionState = wouldReconnect;
          if (!newConnectionState && state === 'close') {
            alertType = 'connection_lost';
            alertMessage = 'Conexão com WhatsApp perdida';
          }
          break;

        case 'qrcode.updated':
          // QR code generated means not connected
          newConnectionState = false;
          sessionValid = true; // Session still valid, just needs scan
          break;

        case 'instance.ready':
          // Ignorar se foi logout manual
          if (isManualLogout) {
            console.log(`[Webhook] Ignoring instance.ready after manual logout for ${instance.instance_name}`);
            return new Response(
              JSON.stringify({ success: true, message: 'Ignored after manual logout' }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          newConnectionState = true;
          sessionValid = true;
          break;

        case 'connection.lost':
        case 'logout':
          newConnectionState = false;
          sessionValid = false;
          alertType = 'session_invalid';
          alertMessage = 'Sessão do WhatsApp encerrada';
          break;

        case 'messages.upsert':
          // Processar mensagens recebidas/enviadas
          // Evolution API envia em diferentes formatos:
          // - Formato v2 padrão: body.data é a mensagem completa com .key, .message, etc
          // - Formato alternativo: body.data.messages ou body.data.message
          const messagesRaw =
            (eventData?.key ? [eventData] : null) || // Se eventData tem .key, já é a mensagem
            eventData.messages ||
            eventData.data?.messages ||
            eventData.message ||
            eventData.data?.message ||
            body.messages ||
            body.message ||
            [];
          const messages = Array.isArray(messagesRaw) ? messagesRaw : [messagesRaw].filter(Boolean);
          
          console.log(`[Webhook] messagesRaw extraction - has key: ${!!eventData?.key}, messagesRaw type: ${Array.isArray(messagesRaw) ? 'array' : typeof messagesRaw}`);
          
          console.log(`[Webhook] messages.upsert received, message count: ${messages.length}`);
          if (messages.length === 0) {
            console.log(`[Webhook] No messages found in payload. eventData keys: ${Object.keys(eventData).join(',')}`);
          }
          
          for (const msg of messages) {
            const remoteJid = msg.key?.remoteJid || msg.remoteJid || '';
            
            console.log(`[Webhook] ===============================================`);
            console.log(`[Webhook] 🔍 PROCESSING MESSAGE`);
            console.log(`[Webhook] remoteJid: ${remoteJid}`);
            console.log(`[Webhook] fromMe: ${msg.key?.fromMe}`);
           console.log(`[Webhook] messageId: ${msg.key?.id || 'N/A'}`);
           console.log(`[Webhook] pushName: ${msg.pushName || 'N/A'}`);
            console.log(`[Webhook] ===============================================`);
            
            // SIMPLES: Ignorar TODOS os grupos - bot apenas para conversas privadas
            if (remoteJid.includes('@g.us')) {
              console.log(`[Webhook] ❌ IGNORED: Group message (bot is private-only)`);
              continue;
            }
            
            console.log(`[Webhook] ✅ PRIVATE MESSAGE - continuing processing`);
            
            // Extração robusta do texto (inclui wrappers como ephemeral/viewOnce e respostas interativas)
            const messageText = extractWhatsAppMessageText(msg);
            console.log(`[Webhook] Extracted text length: ${String(messageText).length}`);
            console.log(`[Webhook] Extracted text: "${String(messageText).substring(0, 100)}"`);

            // Extração robusta do telefone do remetente
            // CRITICAL: Pass the instance's connected_phone to avoid returning it
            // (which would cause bot to respond to itself instead of the client)
            const instancePhone = instance.connected_phone ? String(instance.connected_phone).replace(/\D/g, '') : undefined;
            let senderPhone = getSenderPhoneFromWebhook(msg, eventData, body, instancePhone);
            
            // Se não conseguiu extrair, tentar normalizar remoteJid diretamente
            if (!senderPhone && remoteJid) {
              const digits = remoteJid.replace(/\D/g, '');
              if (digits.length >= 10 && digits.length <= 15) {
                senderPhone = digits;
                console.log(`[Webhook] ✅ Extracted phone from remoteJid fallback: ${senderPhone}`);
              }
            }
            
            console.log(`[Webhook] Processing DIRECT message from ${senderPhone}`);

            if (!senderPhone) {
              const keyObj = msg?.key && typeof msg.key === 'object' ? msg.key : {};
              console.log('[Webhook] Could not extract sender phone. remoteJid:', remoteJid);
              console.log('[Webhook] key snapshot:', JSON.stringify({
                remoteJid: keyObj?.remoteJid,
                participant: keyObj?.participant,
                participantAlt: keyObj?.participantAlt,
                fromMe: keyObj?.fromMe,
              }));
              console.log('[Webhook] webhook sender snapshot:', JSON.stringify({
                sender: eventData?.sender || body?.sender,
              }));
            }
            
            console.log(`[Webhook] Message from ${senderPhone}: "${String(messageText).substring(0, 50)}", fromMe: ${msg.key?.fromMe}`);

            if (!String(messageText || '').trim()) {
              // Helps debug cases where the webhook arrives but we fail to extract the message content.
              const msgKeys = msg && typeof msg === 'object' ? Object.keys(msg) : [];
              const msgMessageKeys = msg?.message && typeof msg.message === 'object' ? Object.keys(msg.message) : [];
              console.log('[Webhook] Empty messageText extracted. msg keys:', msgKeys.join(','));
              console.log('[Webhook] Empty messageText extracted. msg.message keys:', msgMessageKeys.join(','));
              console.warn(`[Webhook] ⚠️ Empty messageText - will skip non-bot processing`);
            }
            
            // ===============================================================
            // MENSAGENS ENVIADAS (fromMe = true) - Processar comandos do atendente
            // ===============================================================
            if (msg.key?.fromMe) {
              const trimmedFromMe = String(messageText || '').trimStart();
              
              // Se for um comando (inicia com /), processar como disparo ativo pelo atendente
              if (trimmedFromMe.startsWith('/')) {
                console.log(`[Webhook] ATTENDANT command detected: "${trimmedFromMe}" to client ${senderPhone}`);
                
                // Buscar configuração de logs do seller
                const { data: configData } = await supabase
                  .from('test_integration_config')
                  .select('logs_enabled')
                  .eq('seller_id', instance.seller_id)
                  .eq('is_active', true)
                  .maybeSingle();
                
                const logsEnabled = configData?.logs_enabled ?? true;
                
                // Chamar edge function de processamento de comando
                // O target_phone é o remoteJid (número do cliente na conversa)
                // O from_attendant flag indica que foi disparado pelo atendente
                try {
                  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                  const commandResponse = await fetch(`${supabaseUrl}/functions/v1/process-whatsapp-command`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      seller_id: instance.seller_id,
                      command_text: trimmedFromMe.trim(),
                      sender_phone: senderPhone, // Este é o número do CLIENTE na conversa
                      instance_name: instanceName,
                      logs_enabled: logsEnabled,
                      from_attendant: true, // Flag para indicar disparo pelo atendente
                    }),
                  });

                  const cmdText = await commandResponse.text();
                  let cmdResult: any = {};
                  try {
                    cmdResult = cmdText ? JSON.parse(cmdText) : {};
                  } catch {
                    cmdResult = { success: false, error: 'Invalid JSON from process-whatsapp-command', raw: cmdText?.substring(0, 500) };
                  }
                  console.log(`[Webhook] ATTENDANT command result:`, JSON.stringify(cmdResult));

                  if (!commandResponse.ok) {
                    try {
                      await supabase.from('command_logs').insert({
                        owner_id: instance.seller_id,
                        command_text: `[ATENDENTE] ${trimmedFromMe}`,
                        sender_phone: senderPhone,
                        success: false,
                        error_message: `process-whatsapp-command HTTP ${commandResponse.status}: ${String(cmdText || '').substring(0, 200)}`,
                      });
                    } catch { /* ignore */ }
                  }
                  
                  // Enviar resposta ao cliente
                  const textToSend = (cmdResult && (cmdResult.response || cmdResult.user_message))
                    ? String(cmdResult.response || cmdResult.user_message)
                    : '';

                  if (textToSend) {
                    const cleanTargetPhone = senderPhone.replace(/\D/g, '');
                    const cleanInstancePhone = instancePhone || '';
                    
                    // Validar que não estamos enviando para o próprio número da instância
                    if (cleanInstancePhone && cleanTargetPhone === cleanInstancePhone) {
                      console.error(`[Webhook] BLOCKED: Attempted to send attendant command response to instance's own number`);
                    } else {
                      // Buscar config global para enviar resposta
                      const { data: globalConfig } = await supabase
                        .from('whatsapp_global_config')
                        .select('api_url, api_token')
                        .eq('is_active', true)
                        .maybeSingle();

                      if (globalConfig?.api_url && globalConfig?.api_token) {
                        const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
                        const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
                        
                        try {
                          const sendResponse = await fetch(sendUrl, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'apikey': globalConfig.api_token,
                            },
                            body: JSON.stringify({
                              number: cleanTargetPhone,
                              text: textToSend,
                            }),
                          });
                          console.log(`[Webhook] ATTENDANT command response sent to ${cleanTargetPhone}, status: ${sendResponse.status}`);
                        } catch (sendErr) {
                          console.error(`[Webhook] Error sending attendant command response:`, sendErr);
                        }
                      }
                    }
                  }
                } catch (cmdErr) {
                  console.error(`[Webhook] Attendant command error:`, cmdErr);
                }
                
                continue; // Comando processado, não continuar
              }
              
              // Verificar se é mensagem de renovação automática do servidor
              await detectAndSyncRenewal(supabase, instance.seller_id, senderPhone, messageText);
              continue; // Não processar mais nada para mensagens enviadas não-comando
            }
            
            // ===============================================================
            // BOT ENGINE INTERCEPT - Verificar se BotEngine deve processar
            // ===============================================================
            // O BotEngine processa apenas mensagens diretas (grupos são filtrados acima)
            console.log(`[Webhook] ===============================================`);
            console.log(`[Webhook] BOTENGINE INTERCEPT ATTEMPT`);
            console.log(`[Webhook] Seller ID: ${instance.seller_id}`);
            console.log(`[Webhook] Sender Phone: ${senderPhone}`);
            console.log(`[Webhook] Instance Name: ${instanceName}`);
            console.log(`[Webhook] Message: "${messageText?.substring(0, 100)}"`);
            console.log(`[Webhook] ===============================================`);
            
            try {
              const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
              const payload = {
                seller_id: instance.seller_id,
                sender_phone: senderPhone,
                message_text: messageText,
                instance_name: instanceName,
              };
              
              console.log(`[Webhook] Calling bot-engine-intercept with payload:`, JSON.stringify(payload));
              
              const botInterceptResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine-intercept`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify(payload),
              });

              console.log(`[Webhook] ===============================================`);
              console.log(`[Webhook] BOTENGINE INTERCEPT RESPONSE`);
              console.log(`[Webhook] Status: ${botInterceptResponse.status}`);
              console.log(`[Webhook] OK: ${botInterceptResponse.ok}`);
              console.log(`[Webhook] ===============================================`);
              
              if (botInterceptResponse.ok) {
                const botResult = await botInterceptResponse.json();
                console.log(`[Webhook] ===============================================`);
                console.log(`[Webhook] BOTENGINE RESULT`);
                console.log(`[Webhook] Intercepted: ${botResult.intercepted}`);
                console.log(`[Webhook] Has Response: ${!!botResult.response}`);
                console.log(`[Webhook] Response: "${botResult.response?.substring(0, 100)}"`);
                console.log(`[Webhook] New State: ${botResult.new_state}`);
                console.log(`[Webhook] ===============================================`);
                
                if (botResult.intercepted && botResult.response) {
                  // ===============================================================
                  // ENVIAR RESPOSTA DO BOTENGINE VIA WHATSAPP (LÓGICA ROBUSTA)
                  // ===============================================================
                  console.log(`[Webhook] ===============================================`);
                  console.log(`[Webhook] PREPARING TO SEND RESPONSE VIA WHATSAPP`);
                  console.log(`[Webhook] ===============================================`);
                  
                  const { data: globalConfig } = await supabase
                    .from('whatsapp_global_config')
                    .select('api_url, api_token')
                    .eq('is_active', true)
                    .maybeSingle();
                  
                  console.log(`[Webhook] Global config found: ${!!globalConfig}`);
                  console.log(`[Webhook] API URL: ${globalConfig?.api_url}`);
                  console.log(`[Webhook] Has API Token: ${!!globalConfig?.api_token}`);

                  if (globalConfig?.api_url && globalConfig?.api_token) {
                    // CRÍTICO: Validar que temos um telefone válido para envio
                    if (!senderPhone) {
                      console.error(`[Webhook] ❌ CANNOT SEND: senderPhone is empty`);
                      console.error(`[Webhook] remoteJid was: ${remoteJid}`);
                      console.error(`[Webhook] Bot response will not be delivered`);
                      continue;
                    }
                    
                    // Normalizar telefone (mesma lógica do send-test-message)
                    let cleanPhone = senderPhone.replace(/\D/g, '');
                    
                    if (cleanPhone.length < 10) {
                      console.error(`[Webhook] ❌ CANNOT SEND: cleanPhone too short (${cleanPhone.length} digits): ${cleanPhone}`);
                      console.error(`[Webhook] Original senderPhone: ${senderPhone}`);
                      console.error(`[Webhook] Bot response will not be delivered`);
                      continue;
                    }
                    
                    if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                      cleanPhone = '55' + cleanPhone;
                    }

                    const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
                    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
                    
                    console.log(`[Webhook] ===============================================`);
                    console.log(`[Webhook] SENDING MESSAGE VIA EVOLUTION API`);
                    console.log(`[Webhook] URL: ${sendUrl}`);
                    console.log(`[Webhook] To: ${cleanPhone}`);
                    console.log(`[Webhook] Message: "${botResult.response}"`);
                    console.log(`[Webhook] ===============================================`);
                    
                    try {
                      const sendResponse = await fetch(sendUrl, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'apikey': globalConfig.api_token,
                        },
                        body: JSON.stringify({
                          number: cleanPhone,
                          text: botResult.response,
                        }),
                      });
                      
                      const responseText = await sendResponse.text();
                      console.log(`[Webhook] Evolution API response status: ${sendResponse.status}`);
                      console.log(`[Webhook] Evolution API response body: ${responseText}`);

                      if (!sendResponse.ok) {
                        console.log(`[Webhook] ⚠️ First attempt failed, trying alternative phone formats...`);
                        
                        // Tentar formatos alternativos (mesma lógica do send-test-message)
                        const alternativeFormats = [
                          cleanPhone.replace(/^55/, ''),
                          cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone,
                          cleanPhone.length === 10 ? `55${cleanPhone.substring(0, 2)}9${cleanPhone.substring(2)}` : cleanPhone
                        ];

                        let sent = false;
                        for (const altPhone of alternativeFormats) {
                          if (altPhone === cleanPhone) continue; // Skip já testado
                          
                          console.log(`[Webhook] 🔄 Retry attempt with phone: ${altPhone}`);
                          const retryResponse = await fetch(sendUrl, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'apikey': globalConfig.api_token,
                            },
                            body: JSON.stringify({
                              number: altPhone,
                              text: botResult.response,
                            }),
                          });
                          
                          const retryText = await retryResponse.text();
                          console.log(`[Webhook] Retry response status: ${retryResponse.status}`);
                          console.log(`[Webhook] Retry response body: ${retryText}`);

                          if (retryResponse.ok) {
                            console.log(`[Webhook] ✅ BotEngine response sent successfully with ${altPhone}`);
                            sent = true;
                            break;
                          } else {
                            console.log(`[Webhook] ❌ Retry failed with ${altPhone}`);
                          }
                        }
                        
                        if (!sent) {
                          console.error(`[Webhook] ===============================================`);
                          console.error(`[Webhook] ❌ FAILED TO SEND RESPONSE AFTER ALL RETRIES`);
                          console.error(`[Webhook] Original phone: ${senderPhone}`);
                          console.error(`[Webhook] Normalized phone: ${cleanPhone}`);
                          console.error(`[Webhook] All attempts failed`);
                          console.error(`[Webhook] ===============================================`);
                        }
                      } else {
                        console.log(`[Webhook] ✅ BotEngine response sent successfully to ${cleanPhone}`);
                      }
                    } catch (sendErr) {
                      console.error(`[Webhook] ===============================================`);
                      console.error(`[Webhook] ❌ EXCEPTION SENDING BOTENGINE RESPONSE`);
                      console.error(`[Webhook] Error:`, sendErr);
                      console.error(`[Webhook] ===============================================`);
                    }
                  } else {
                    console.error(`[Webhook] ===============================================`);
                    console.error(`[Webhook] ❌ NO WHATSAPP GLOBAL CONFIG FOUND`);
                    console.error(`[Webhook] Cannot send BotEngine response - missing Evolution API config`);
                    console.error(`[Webhook] ===============================================`);
                  }
                  
                  continue; // Mensagem processada pelo BotEngine, não continuar
                } else {
                  console.log(`[Webhook] ℹ️ BotEngine did not intercept - continuing to normal flow`);
                }
              } else {
                const errorText = await botInterceptResponse.text();
                console.error(`[Webhook] ===============================================`);
                console.error(`[Webhook] ❌ BOTENGINE INTERCEPT FAILED`);
                console.error(`[Webhook] Status: ${botInterceptResponse.status}`);
                console.error(`[Webhook] Response: ${errorText}`);
                console.error(`[Webhook] ===============================================`);
              }
            } catch (botErr) {
              // Se BotEngine falhar, continuar com fluxo normal
              console.error(`[Webhook] ===============================================`);
              console.error(`[Webhook] ❌ BOTENGINE INTERCEPT EXCEPTION`);
              console.error(`[Webhook] Error:`, botErr instanceof Error ? botErr.message : String(botErr));
              console.error(`[Webhook] Stack:`, botErr instanceof Error ? botErr.stack : 'N/A');
              console.error(`[Webhook] ===============================================`);
            }

            // ===============================================================
            // MENSAGENS RECEBIDAS - Verificar se é comando
            // ===============================================================
            
            const trimmedForCommand = String(messageText || '').trimStart();
            if (trimmedForCommand.startsWith('/')) {
              console.log(`[Webhook] Command detected: "${trimmedForCommand}" from ${senderPhone}`);
              
              // Buscar configuração de logs do seller
              const { data: configData } = await supabase
                .from('test_integration_config')
                .select('logs_enabled')
                .eq('seller_id', instance.seller_id)
                .eq('is_active', true)
                .maybeSingle();
              
              const logsEnabled = configData?.logs_enabled ?? true;
              
              // Chamar edge function de processamento de comando
              try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                const commandResponse = await fetch(`${supabaseUrl}/functions/v1/process-whatsapp-command`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    seller_id: instance.seller_id,
                    command_text: trimmedForCommand.trim(),
                    sender_phone: senderPhone,
                    instance_name: instanceName,
                    logs_enabled: logsEnabled,
                  }),
                });

                const cmdText = await commandResponse.text();
                let cmdResult: any = {};
                try {
                  cmdResult = cmdText ? JSON.parse(cmdText) : {};
                } catch {
                  cmdResult = { success: false, error: 'Invalid JSON from process-whatsapp-command', raw: cmdText?.substring(0, 500) };
                }
                console.log(`[Webhook] Command result for seller ${instance.seller_id}:`, JSON.stringify(cmdResult));

                if (!commandResponse.ok) {
                  // Log HTTP-level failures explicitly
                  try {
                    await supabase.from('command_logs').insert({
                      owner_id: instance.seller_id,
                      command_text: trimmedForCommand,
                      sender_phone: senderPhone,
                      success: false,
                      error_message: `process-whatsapp-command HTTP ${commandResponse.status}: ${String(cmdText || '').substring(0, 200)}`,
                    });
                  } catch { /* ignore */ }
                }
                
                // Enviar resposta via WhatsApp:
                // - em sucesso: usa cmdResult.response
                // - em validação/erro controlado: usa cmdResult.user_message (sem alterar fluxo principal)
                const textToSend = (cmdResult && (cmdResult.response || cmdResult.user_message))
                  ? String(cmdResult.response || cmdResult.user_message)
                  : '';

                if (textToSend) {
                  // =====================================================================
                  // CRITICAL VALIDATION: Never send response to the instance's own number
                  // This would cause the bot to message itself!
                  // =====================================================================
                  const cleanSenderPhone = senderPhone.replace(/\D/g, '');
                  const cleanInstancePhone = instancePhone || '';
                  
                  if (cleanInstancePhone && cleanSenderPhone === cleanInstancePhone) {
                    console.error(`[Webhook] BLOCKED: Attempted to send response to instance's own number: ${cleanSenderPhone}`);
                    console.error(`[Webhook] This indicates senderPhone extraction failed - the bot was about to message itself!`);
                    try {
                      await supabase.from('command_logs').insert({
                        owner_id: instance.seller_id,
                        command_text: trimmedForCommand,
                        sender_phone: senderPhone,
                        success: false,
                        error_message: `BLOCKED: Would send to instance own number (${cleanSenderPhone}). Check webhook payload extraction.`,
                      });
                    } catch { /* ignore */ }
                    // Skip sending - this is a critical error in phone extraction
                  } else {
                    // Buscar config global para enviar resposta
                    const { data: globalConfig } = await supabase
                      .from('whatsapp_global_config')
                      .select('api_url, api_token')
                      .eq('is_active', true)
                      .maybeSingle();
                    
                    if (globalConfig?.api_url && globalConfig?.api_token) {
                      const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
                      // IMPORTANTE: usar sempre o nome REAL salvo no banco (pode diferir do payload em casos de rename/original_instance_name)
                      const sendUrl = `${apiUrl}/message/sendText/${instance.instance_name}`;
                      
                      // Normalização robusta do número com variações para retry
                      const cleanPhone = senderPhone.replace(/\D/g, '');
                      
                      // Gerar variações do número para tentar múltiplos formatos
                      const phoneVariants: string[] = [];
                    
                      // Formato original
                      phoneVariants.push(cleanPhone);
                      
                      // Com DDI 55 se não tiver
                      if (!cleanPhone.startsWith('55') && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
                        phoneVariants.push(`55${cleanPhone}`);
                      }
                      
                      // Sem DDI se tiver
                      if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
                        phoneVariants.push(cleanPhone.substring(2));
                      }
                      
                      // Com 9º dígito (celular brasileiro)
                      if (cleanPhone.startsWith('55') && cleanPhone.length === 12) {
                        const ddd = cleanPhone.substring(2, 4);
                        const num = cleanPhone.substring(4);
                        if (!num.startsWith('9') && parseInt(ddd) >= 11) {
                          phoneVariants.push(`55${ddd}9${num}`);
                        }
                      }
                      
                      // Sem 9º dígito
                      if (cleanPhone.startsWith('55') && cleanPhone.length === 13) {
                        const without9 = cleanPhone.substring(0, 4) + cleanPhone.substring(5);
                        phoneVariants.push(without9);
                      }
                      
                      // Dedupe
                      const uniqueVariants = [...new Set(phoneVariants)];
                      console.log(`[Webhook] Sending response to ${senderPhone}, trying ${uniqueVariants.length} format(s): ${uniqueVariants.join(', ')}`);
                      
                      let messageSent = false;
                      for (const phoneVariant of uniqueVariants) {
                        const sendResponse = await fetch(sendUrl, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'apikey': globalConfig.api_token,
                          },
                          body: JSON.stringify({
                            number: phoneVariant,
                            text: textToSend,
                          }),
                        });
                        
                        if (sendResponse.ok) {
                          console.log(`[Webhook] Command response sent successfully with format: ${phoneVariant}`);
                          messageSent = true;
                          break;
                        } else {
                          const errText = await sendResponse.text();
                          console.log(`[Webhook] Format ${phoneVariant} failed (${sendResponse.status}): ${errText.substring(0, 100)}`);
                        }
                      }
                      
                      if (!messageSent) {
                        console.error(`[Webhook] All ${uniqueVariants.length} phone formats failed for ${senderPhone}`);
                        // Log failure for debugging - fire and forget
                        try {
                          await supabase.from('command_logs').insert({
                            owner_id: instance.seller_id,
                            command_text: trimmedForCommand,
                            sender_phone: senderPhone,
                            success: false,
                            error_message: `Failed to send response - all ${uniqueVariants.length} phone formats failed`,
                          });
                        } catch { /* ignore logging errors */ }
                      }
                    } else {
                      console.error(`[Webhook] Global config not found or inactive - cannot send response`);
                      // Log this critical issue
                      try {
                        await supabase.from('command_logs').insert({
                          owner_id: instance.seller_id,
                          command_text: trimmedForCommand,
                          sender_phone: senderPhone,
                          success: false,
                          error_message: 'Global WhatsApp config not found or inactive',
                        });
                      } catch { /* ignore logging errors */ }
                    }
                  } // End of else block (sender not instance phone)
                } else if (cmdResult.not_found) {
                  // Comando não encontrado - não fazer nada (fluxo normal continua)
                  console.log(`[Webhook] Command "${trimmedForCommand}" not found for seller ${instance.seller_id}, ignoring`);
                } else if (cmdResult.error) {
                  console.error(`[Webhook] Command error: ${cmdResult.error}`);
                  // Log command errors
                  try {
                    await supabase.from('command_logs').insert({
                      owner_id: instance.seller_id,
                      command_text: trimmedForCommand,
                      sender_phone: senderPhone,
                      success: false,
                      error_message: cmdResult.error,
                    });
                  } catch { /* ignore logging errors */ }
                }
              } catch (cmdError) {
                const errMsg = cmdError instanceof Error ? cmdError.message : String(cmdError);
                console.error(`[Webhook] Command processing error:`, errMsg);
                // Log processing errors
                try {
                  await supabase.from('command_logs').insert({
                    owner_id: instance.seller_id,
                    command_text: trimmedForCommand,
                    sender_phone: senderPhone,
                    success: false,
                    error_message: `Processing error: ${errMsg}`,
                  });
                } catch { /* ignore logging errors */ }
              }
            }
            // Se não for comando, deixar o fluxo normal do chatbot/automação
          }
          break;
      }

      // Update instance status
      await supabase
        .from('whatsapp_seller_instances')
        .update({
          is_connected: newConnectionState,
          session_valid: sessionValid,
          last_heartbeat_at: new Date().toISOString(),
          last_evolution_state: event,
          offline_since: newConnectionState ? null : (instance.is_connected ? new Date().toISOString() : undefined),
          heartbeat_failures: newConnectionState ? 0 : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('seller_id', instance.seller_id);

      // Log event
      await supabase.rpc('log_connection_event', {
        p_seller_id: instance.seller_id,
        p_instance_name: instance.instance_name,
        p_event_type: event,
        p_event_source: 'webhook',
        p_previous_state: instance.is_connected ? 'connected' : 'disconnected',
        p_new_state: newConnectionState ? 'connected' : 'disconnected',
        p_is_connected: newConnectionState,
        p_metadata: { webhook_data: eventData },
      });

      // Create alert if needed
      if (alertType) {
        await supabase.rpc('create_connection_alert', {
          p_seller_id: instance.seller_id,
          p_instance_name: instance.instance_name,
          p_alert_type: alertType,
          p_severity: 'critical',
          p_message: alertMessage,
        });
      }

      return new Response(
        JSON.stringify({ success: true, processed: event }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get global Evolution API config
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!globalConfig) {
      return new Response(
        JSON.stringify({ error: 'Evolution API not configured' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      // ============================================================
      // SINGLE INSTANCE HEARTBEAT (called by frontend or specific seller)
      // ============================================================
      case 'check_single': {
        if (!seller_id) {
          return new Response(
            JSON.stringify({ error: 'seller_id required' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('seller_id', seller_id)
          .maybeSingle();

        if (!instance?.instance_name) {
          return new Response(
            JSON.stringify({ configured: false, connected: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check actual Evolution API status
        const checkResult = await checkEvolutionConnection(
          globalConfig.api_url,
          globalConfig.api_token,
          instance.instance_name
        );

        // Update database if status changed
        const statusChanged = instance.is_connected !== checkResult.connected;

        // Build update object with phone number if available
        const updateData: Record<string, any> = {
          is_connected: checkResult.connected,
          last_heartbeat_at: new Date().toISOString(),
          last_evolution_state: checkResult.state,
          heartbeat_failures: checkResult.connected ? 0 : (instance.heartbeat_failures || 0) + 1,
          offline_since: checkResult.connected 
            ? null 
            : (instance.offline_since || new Date().toISOString()),
          session_valid: checkResult.connected || (instance.heartbeat_failures || 0) < 3,
          updated_at: new Date().toISOString(),
        };

        // Update connected phone if we got it from the API
        if (checkResult.phone) {
          updateData.connected_phone = checkResult.phone;
        }

        await supabase
          .from('whatsapp_seller_instances')
          .update(updateData)
          .eq('seller_id', seller_id);

        // Log if status changed
        if (statusChanged) {
          await supabase.rpc('log_connection_event', {
            p_seller_id: seller_id,
            p_instance_name: instance.instance_name,
            p_event_type: checkResult.connected ? 'connected' : 'disconnected',
            p_event_source: 'heartbeat',
            p_previous_state: instance.is_connected ? 'connected' : 'disconnected',
            p_new_state: checkResult.connected ? 'connected' : 'disconnected',
            p_is_connected: checkResult.connected,
            p_error_message: checkResult.error || null,
            p_metadata: { evolution_state: checkResult.state, phone: checkResult.phone },
          });
        }

        return new Response(
          JSON.stringify({
            configured: true,
            connected: checkResult.connected,
            state: checkResult.state,
            instance_name: instance.instance_name,
            last_heartbeat: new Date().toISOString(),
            session_valid: checkResult.connected || (instance.heartbeat_failures || 0) < 3,
            connected_phone: checkResult.phone || instance.connected_phone,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // BATCH HEARTBEAT (check all active instances - for cron job)
      // ============================================================
      case 'check_all': {
        const { data: instances } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('instance_blocked', false);

        if (!instances || instances.length === 0) {
          return new Response(
            JSON.stringify({ message: 'No instances to check', checked: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const results = {
          checked: 0,
          connected: 0,
          disconnected: 0,
          errors: 0,
          reconnected: 0,
          needs_qr: 0,
        };

        for (const instance of instances) {
          if (!instance.instance_name) continue;
          
          results.checked++;

          // Check connection status
          const checkResult = await checkEvolutionConnection(
            globalConfig.api_url,
            globalConfig.api_token,
            instance.instance_name
          );

          if (checkResult.connected) {
            results.connected++;
            
            // Update as connected
            await supabase
              .from('whatsapp_seller_instances')
              .update({
                is_connected: true,
                last_heartbeat_at: new Date().toISOString(),
                last_evolution_state: checkResult.state,
                heartbeat_failures: 0,
                reconnect_attempts: 0,
                offline_since: null,
                session_valid: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', instance.id);

            // Resolve any disconnect alerts
            await supabase
              .from('connection_alerts')
              .update({ is_resolved: true, resolved_at: new Date().toISOString() })
              .eq('seller_id', instance.seller_id)
              .eq('is_resolved', false);

          } else {
            results.disconnected++;
            
            const failures = (instance.heartbeat_failures || 0) + 1;
            const reconnectAttempts = instance.reconnect_attempts || 0;

            // Try to reconnect if not too many attempts
            if (reconnectAttempts < RETRY_DELAYS.length) {
              const reconnectResult = await attemptReconnect(
                globalConfig.api_url,
                globalConfig.api_token,
                instance.instance_name
              );

              if (reconnectResult.success) {
                results.reconnected++;
                
                await supabase
                  .from('whatsapp_seller_instances')
                  .update({
                    is_connected: true,
                    last_heartbeat_at: new Date().toISOString(),
                    heartbeat_failures: 0,
                    reconnect_attempts: 0,
                    last_reconnect_attempt_at: new Date().toISOString(),
                    offline_since: null,
                    session_valid: true,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', instance.id);

                // Log successful reconnection
                await supabase.rpc('log_connection_event', {
                  p_seller_id: instance.seller_id,
                  p_instance_name: instance.instance_name,
                  p_event_type: 'auto_reconnect_success',
                  p_event_source: 'heartbeat',
                  p_previous_state: 'disconnected',
                  p_new_state: 'connected',
                  p_is_connected: true,
                  p_metadata: { attempt: reconnectAttempts + 1 },
                });

                continue;
              }

              if (reconnectResult.needsQR) {
                results.needs_qr++;
                
                await supabase
                  .from('whatsapp_seller_instances')
                  .update({
                    is_connected: false,
                    session_valid: false,
                    last_heartbeat_at: new Date().toISOString(),
                    reconnect_attempts: reconnectAttempts + 1,
                    last_reconnect_attempt_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', instance.id);

                // Create alert for user
                await supabase.rpc('create_connection_alert', {
                  p_seller_id: instance.seller_id,
                  p_instance_name: instance.instance_name,
                  p_alert_type: 'session_invalid',
                  p_severity: 'critical',
                  p_message: 'Sessão do WhatsApp expirou. É necessário escanear o QR Code novamente.',
                });

                continue;
              }
            }

            // Just update as disconnected
            await supabase
              .from('whatsapp_seller_instances')
              .update({
                is_connected: false,
                last_heartbeat_at: new Date().toISOString(),
                last_evolution_state: checkResult.state,
                heartbeat_failures: failures,
                reconnect_attempts: reconnectAttempts + 1,
                last_reconnect_attempt_at: new Date().toISOString(),
                offline_since: instance.offline_since || new Date().toISOString(),
                session_valid: failures < 3,
                updated_at: new Date().toISOString(),
              })
              .eq('id', instance.id);

            // Create alert if offline too long (more than 5 minutes)
            if (instance.offline_since) {
              const offlineSince = new Date(instance.offline_since);
              const offlineMinutes = (Date.now() - offlineSince.getTime()) / 60000;
              
              if (offlineMinutes > 5) {
                await supabase.rpc('create_connection_alert', {
                  p_seller_id: instance.seller_id,
                  p_instance_name: instance.instance_name,
                  p_alert_type: 'offline_too_long',
                  p_severity: 'critical',
                  p_message: `WhatsApp offline há ${Math.round(offlineMinutes)} minutos. Verifique sua conexão.`,
                });
              }
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Log summary
        console.log('Heartbeat batch completed:', results);

        return new Response(
          JSON.stringify({ 
            success: true, 
            results,
            timestamp: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // MANUAL RECONNECT (user triggered)
      // ============================================================
      case 'reconnect': {
        if (!seller_id) {
          return new Response(
            JSON.stringify({ error: 'seller_id required' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('seller_id', seller_id)
          .maybeSingle();

        if (!instance?.instance_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'Instance not found' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Attempt reconnection
        const reconnectResult = await attemptReconnect(
          globalConfig.api_url,
          globalConfig.api_token,
          instance.instance_name
        );

        if (reconnectResult.success) {
          await supabase
            .from('whatsapp_seller_instances')
            .update({
              is_connected: true,
              last_heartbeat_at: new Date().toISOString(),
              heartbeat_failures: 0,
              reconnect_attempts: 0,
              offline_since: null,
              session_valid: true,
              connection_source: 'manual_reconnect',
              updated_at: new Date().toISOString(),
            })
            .eq('seller_id', seller_id);

          // Log reconnection
          await supabase.rpc('log_connection_event', {
            p_seller_id: seller_id,
            p_instance_name: instance.instance_name,
            p_event_type: 'manual_reconnect_success',
            p_event_source: 'frontend',
            p_previous_state: 'disconnected',
            p_new_state: 'connected',
            p_is_connected: true,
          });

          return new Response(
            JSON.stringify({ success: true, connected: true, needsQR: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update session validity
        await supabase
          .from('whatsapp_seller_instances')
          .update({
            session_valid: !reconnectResult.needsQR,
            last_reconnect_attempt_at: new Date().toISOString(),
            reconnect_attempts: (instance.reconnect_attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('seller_id', seller_id);

        // Log failed reconnection
        await supabase.rpc('log_connection_event', {
          p_seller_id: seller_id,
          p_instance_name: instance.instance_name,
          p_event_type: 'manual_reconnect_failed',
          p_event_source: 'frontend',
          p_previous_state: 'disconnected',
          p_new_state: 'disconnected',
          p_is_connected: false,
          p_error_message: reconnectResult.error || (reconnectResult.needsQR ? 'Needs new QR code' : 'Unknown error'),
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            connected: false, 
            needsQR: reconnectResult.needsQR,
            error: reconnectResult.error,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // GET ALERTS (for frontend)
      // ============================================================
      case 'get_alerts': {
        if (!seller_id) {
          return new Response(
            JSON.stringify({ error: 'seller_id required' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: alerts } = await supabase
          .from('connection_alerts')
          .select('*')
          .eq('seller_id', seller_id)
          .eq('is_resolved', false)
          .order('created_at', { ascending: false });

        return new Response(
          JSON.stringify({ alerts: alerts || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // CLEANUP OLD LOGS
      // ============================================================
      case 'cleanup': {
        const result = await supabase.rpc('cleanup_old_connection_logs');
        
        return new Response(
          JSON.stringify({ success: true, deleted: result.data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // DIAGNOSE WEBHOOK - Check if webhook is configured correctly
      // ============================================================
      case 'diagnose': {
        if (!seller_id) {
          return new Response(
            JSON.stringify({ error: 'seller_id required' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: instance } = await supabase
          .from('whatsapp_seller_instances')
          .select('*')
          .eq('seller_id', seller_id)
          .maybeSingle();

        if (!instance?.instance_name) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Instância não encontrada',
              diagnosis: {
                instance_configured: false,
              }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check webhook configuration on Evolution API
        const baseUrl = normalizeApiUrl(globalConfig.api_url);
        let webhookConfig = null;
        let webhookError = null;
        let webhookEventsEnabled: string[] = [];
        let webhookUrl = '';

        try {
          const webhookCheckUrl = `${baseUrl}/webhook/find/${instance.instance_name}`;
          console.log(`[Diagnose] Checking webhook at: ${webhookCheckUrl}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
          
          const webhookResponse = await fetch(webhookCheckUrl, {
            method: 'GET',
            headers: {
              'apikey': globalConfig.api_token,
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          if (webhookResponse.ok) {
            webhookConfig = await webhookResponse.json();
            console.log('[Diagnose] Webhook config:', JSON.stringify(webhookConfig));
            
            // Extract webhook URL and events from different response formats
            webhookUrl = webhookConfig?.webhook?.url || webhookConfig?.url || webhookConfig?.webhookUrl || '';
            webhookEventsEnabled = webhookConfig?.webhook?.events || webhookConfig?.events || [];
            
            // Some API versions return events as object with boolean values
            if (typeof webhookEventsEnabled === 'object' && !Array.isArray(webhookEventsEnabled)) {
              const eventsObj = webhookEventsEnabled as Record<string, boolean>;
              webhookEventsEnabled = Object.entries(eventsObj)
                .filter(([_, enabled]) => enabled)
                .map(([event]) => event);
            }
          } else {
            webhookError = `${webhookResponse.status} - ${await webhookResponse.text()}`;
          }
        } catch (err) {
          webhookError = (err as Error).message;
        }

        // Check recent connection logs
        const { data: recentLogs } = await supabase
          .from('connection_logs')
          .select('event_type, created_at, event_source')
          .eq('seller_id', seller_id)
          .order('created_at', { ascending: false })
          .limit(20);

        // Check if we received any messages.upsert events
        const messageEvents = recentLogs?.filter(l => l.event_type === 'messages.upsert') || [];

        // Check recent command logs
        const { data: recentCommandLogs } = await supabase
          .from('command_logs')
          .select('command_text, created_at, success, error_message')
          .eq('owner_id', seller_id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Check for commands
        const { data: commands } = await supabase
          .from('whatsapp_commands')
          .select('id, command, is_active')
          .eq('owner_id', seller_id);

        // Check test integration config
        const { data: testConfig } = await supabase
          .from('test_integration_config')
          .select('*')
          .eq('seller_id', seller_id)
          .eq('is_active', true)
          .maybeSingle();

        // Use the actual backend base URL for this project
        const expectedUrl = `${supabaseUrl}/functions/v1/connection-heartbeat`;
        const urlMatches = webhookUrl.includes('connection-heartbeat') || webhookUrl === expectedUrl;
        const hasMessagesEvent = webhookEventsEnabled.some(e => 
          e.toLowerCase().includes('messages') || 
          e.toLowerCase().includes('message') ||
          e === 'MESSAGES_UPSERT'
        );

        const diagnosis = {
          instance_configured: true,
          instance_name: instance.instance_name,
          is_connected: instance.is_connected,
          session_valid: instance.session_valid,
          last_heartbeat: instance.last_heartbeat_at,
          webhook: {
            configured: webhookConfig !== null && !webhookError,
            url: webhookUrl,
            url_correct: urlMatches,
            events_enabled: webhookEventsEnabled,
            has_messages_event: hasMessagesEvent,
            expected_url: expectedUrl,
            error: webhookError,
            raw_config: webhookConfig,
          },
          commands: {
            total: commands?.length || 0,
            active: commands?.filter(c => c.is_active).length || 0,
            list: commands?.map(c => ({ command: c.command, active: c.is_active })) || [],
          },
          test_integration: {
            configured: testConfig !== null,
            auto_create_client: testConfig?.auto_create_client,
            logs_enabled: testConfig?.logs_enabled,
          },
          recent_events: {
            total: recentLogs?.length || 0,
            message_events: messageEvents.length,
            events: recentLogs?.slice(0, 5).map(l => ({ type: l.event_type, source: l.event_source, at: l.created_at })) || [],
          },
          recent_commands: {
            total: recentCommandLogs?.length || 0,
            logs: recentCommandLogs?.slice(0, 5).map(l => ({ 
              command: l.command_text, 
              success: l.success, 
              error: l.error_message,
              at: l.created_at 
            })) || [],
          },
          recommendations: [] as string[],
          critical_issues: [] as string[],
        };

        // Generate recommendations and critical issues
        if (!instance.is_connected) {
          diagnosis.critical_issues.push('❌ Instância WhatsApp DESCONECTADA. Reconecte escaneando o QR Code.');
        }
        
        if (!webhookConfig || webhookError) {
          diagnosis.critical_issues.push('❌ Webhook NÃO ENCONTRADO na Evolution API. O bot não receberá mensagens!');
          diagnosis.recommendations.push('Configure o webhook na Evolution API apontando para: ' + expectedUrl);
        } else {
          if (!urlMatches) {
            diagnosis.critical_issues.push('❌ URL do webhook INCORRETA. O bot não receberá mensagens!');
            diagnosis.recommendations.push(`Corrija a URL do webhook de "${webhookUrl}" para "${expectedUrl}"`);
          }
          if (!hasMessagesEvent) {
            diagnosis.critical_issues.push('❌ Evento MESSAGES_UPSERT não está habilitado no webhook!');
            diagnosis.recommendations.push('Habilite o evento "MESSAGES_UPSERT" nas configurações do webhook.');
          }
        }
        
        if (messageEvents.length === 0 && instance.is_connected) {
          diagnosis.recommendations.push('Nenhum evento de mensagem recebido ainda. Envie uma mensagem de teste no WhatsApp.');
        }
        
        if (!commands || commands.length === 0) {
          diagnosis.recommendations.push('Nenhum comando configurado. Crie um comando como /teste.');
        } else {
          const activeCommands = commands.filter(c => c.is_active);
          if (activeCommands.length === 0) {
            diagnosis.recommendations.push('Todos os comandos estão desativados. Ative pelo menos um.');
          }
        }

        // Overall status
        const isFullyWorking = 
          instance.is_connected && 
          webhookConfig && 
          urlMatches && 
          hasMessagesEvent && 
          (commands?.filter(c => c.is_active).length || 0) > 0;

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: isFullyWorking ? 'OK' : 'ISSUES_FOUND',
            diagnosis 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: check_single, check_all, reconnect, get_alerts, cleanup' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error('Heartbeat error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
