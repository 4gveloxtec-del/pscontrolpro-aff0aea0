import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const url = `${baseUrl}/instance/connectionState/${instanceName}`;
      
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
      const state = result?.instance?.state || result?.state || 'unknown';
      const isConnected = state === 'open';
      
      // Extract phone number from various possible response formats
      // Evolution API returns owner as "5511999999999@s.whatsapp.net" or just the number
      let phone: string | undefined;
      const ownerJid = result?.instance?.owner || result?.owner || result?.instance?.ownerJid || result?.ownerJid;
      if (ownerJid) {
        // Remove @s.whatsapp.net suffix if present
        phone = ownerJid.replace(/@.*$/, '');
      }
      
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

    const body = await req.json().catch(() => ({}));
    const { action, seller_id, webhook_event } = body;

    // ============================================================
    // WEBHOOK HANDLER - Receive events from Evolution API
    // ============================================================
    if (action === 'webhook' || webhook_event) {
      console.log('[Webhook] Received event:', JSON.stringify(body, null, 2));
      
      const event = webhook_event || body.event;
      const instanceName = body.instance || body.data?.instance?.instanceName;
      const eventData = body.data || body;
      
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: 'Instance name required' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find seller by instance name
      const { data: instance } = await supabase
        .from('whatsapp_seller_instances')
        .select('seller_id, instance_name, is_connected')
        .or(`instance_name.eq.${instanceName},original_instance_name.eq.${instanceName}`)
        .maybeSingle();

      if (!instance) {
        console.log('[Webhook] Instance not found:', instanceName);
        return new Response(
          JSON.stringify({ error: 'Instance not found' }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
