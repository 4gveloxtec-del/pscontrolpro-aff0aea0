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

// Attempt to reconnect without QR code (restart instance)
async function attemptReconnect(
  apiUrl: string,
  apiToken: string,
  instanceName: string
): Promise<{ success: boolean; needsQR: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(apiUrl);
    
    // First, try to restart the instance
    const restartUrl = `${baseUrl}/instance/restart/${instanceName}`;
    
    const restartResponse = await fetch(restartUrl, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'apikey': apiToken 
      },
    });

    if (restartResponse.ok) {
      // Wait a bit and check connection
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const checkResult = await checkEvolutionConnection(apiUrl, apiToken, instanceName);
      if (checkResult.connected) {
        return { success: true, needsQR: false };
      }
    }

    // If restart didn't work, check if we need a new QR
    const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
    const connectResponse = await fetch(connectUrl, {
      method: 'GET',
      headers: { 'apikey': apiToken },
    });

    if (connectResponse.ok) {
      const result = await connectResponse.json();
      // If we got a QR code back, session is invalid
      if (result.base64 || result.code || result.qrcode) {
        return { success: false, needsQR: true };
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
    const isWebhookRequest = action === 'webhook' || !!webhook_event || !!(body as any)?.event;

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

      // Find seller by instance name - try exact match first, then original_instance_name
      console.log(`[Webhook] Looking for instance: "${instanceName}"`);
      
      let instance = null;
      
      // First try instance_name
      const { data: inst1 } = await supabase
        .from('whatsapp_seller_instances')
        .select('seller_id, instance_name, is_connected')
        .eq('instance_name', instanceName)
        .maybeSingle();
      
      if (inst1) {
        instance = inst1;
      } else {
        // Try original_instance_name
        const { data: inst2 } = await supabase
          .from('whatsapp_seller_instances')
          .select('seller_id, instance_name, is_connected')
          .eq('original_instance_name', instanceName)
          .maybeSingle();
        instance = inst2;
      }

      if (!instance) {
        console.log('[Webhook] Instance not found for:', instanceName);
        return new Response(
          JSON.stringify({ error: 'Instance not found', instance_name: instanceName }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[Webhook] Found seller_id: ${instance.seller_id} for instance: ${instanceName}`);

      // Handle different webhook events
      let newConnectionState = instance.is_connected;
      let sessionValid = true;
      let alertType: string | null = null;
      let alertMessage = '';

      switch (event) {
        case 'connection.update':
          const state = eventData.state || eventData.connection?.state;
          newConnectionState = state === 'open';
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
          const messages = eventData.messages || eventData.data?.messages || [];
          for (const msg of messages) {
            const remoteJid = msg.key?.remoteJid || '';
            
            // Ignorar mensagens de grupos - apenas conversas individuais
            if (remoteJid.includes('@g.us')) {
              console.log(`[Webhook] Ignoring group message from: ${remoteJid}`);
              continue;
            }
            
            const messageText = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text || 
                               '';
            
            const senderPhone = remoteJid.replace('@s.whatsapp.net', '') || '';
            
            // ===============================================================
            // MENSAGENS ENVIADAS (fromMe = true) - Detectar renovação da API do servidor
            // ===============================================================
            if (msg.key?.fromMe) {
              // Verificar se é mensagem de renovação automática do servidor
              await detectAndSyncRenewal(supabase, instance.seller_id, senderPhone, messageText);
              continue; // Não processar mais nada para mensagens enviadas
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
                
                const cmdResult = await commandResponse.json();
                console.log(`[Webhook] Command result for seller ${instance.seller_id}:`, JSON.stringify(cmdResult));
                
                // Se comando foi processado com sucesso, enviar resposta via WhatsApp
                if (cmdResult.success && cmdResult.response) {
                  // Buscar config global para enviar resposta
                  const { data: globalConfig } = await supabase
                    .from('whatsapp_global_config')
                    .select('api_url, api_token')
                    .eq('is_active', true)
                    .maybeSingle();
                  
                  if (globalConfig?.api_url && globalConfig?.api_token) {
                    const apiUrl = globalConfig.api_url.replace(/\/+$/, '');
                    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
                    
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
                          text: cmdResult.response,
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
                    }
                  } else {
                    console.error(`[Webhook] Global config not found or inactive - cannot send response`);
                  }
                } else if (cmdResult.not_found) {
                  // Comando não encontrado - não fazer nada (fluxo normal continua)
                  console.log(`[Webhook] Command "${messageText}" not found for seller ${instance.seller_id}, ignoring`);
                } else if (cmdResult.error) {
                  console.error(`[Webhook] Command error: ${cmdResult.error}`);
                }
              } catch (cmdError) {
                console.error(`[Webhook] Command processing error:`, cmdError);
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
          
          const webhookResponse = await fetch(webhookCheckUrl, {
            method: 'GET',
            headers: {
              'apikey': globalConfig.api_token,
            },
          });

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

        const expectedUrl = 'https://kgtqnjhmwsvswhrczqaf.supabase.co/functions/v1/connection-heartbeat';
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
