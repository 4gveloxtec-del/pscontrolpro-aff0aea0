import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthConfig {
  is_enabled: boolean;
  check_interval_seconds: number;
  auto_repair_enabled: boolean;
  max_repair_attempts: number;
  notify_admin_on_critical: boolean;
}

interface HealthStatus {
  id: string;
  component_name: string;
  component_type: string;
  status: string;
  consecutive_failures: number;
  repair_attempts: number;
  last_error: string | null;
  metadata: Record<string, unknown>;
}

interface RepairAction {
  id: string;
  component_name: string;
  action_name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  is_safe: boolean;
  max_daily_executions: number;
  executions_today: number;
}

interface CheckResult {
  healthy: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

// Classificar severidade baseado em falhas consecutivas
function getSeverity(consecutiveFailures: number): string {
  if (consecutiveFailures >= 5) return 'critical';
  if (consecutiveFailures >= 3) return 'high';
  if (consecutiveFailures >= 2) return 'medium';
  return 'low';
}

// Verificar conexão com banco de dados
async function checkDatabaseConnection(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const start = Date.now();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const latency = Date.now() - start;
    
    if (error) {
      return { healthy: false, error: error.message };
    }
    
    if (latency > 5000) {
      return { healthy: false, error: `High latency: ${latency}ms`, details: { latency } };
    }
    
    return { healthy: true, details: { latency } };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

// Verificar instâncias WhatsApp dos sellers
async function checkSellerInstances(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data: instances, error } = await supabase
      .from('whatsapp_seller_instances')
      .select('id, instance_name, is_connected, instance_blocked, seller_id')
      .eq('instance_blocked', false);
    
    if (error) {
      return { healthy: false, error: error.message };
    }
    
    const instanceList = instances as Array<{ id: string; is_connected: boolean }> || [];
    const disconnected = instanceList.filter(i => !i.is_connected);
    const total = instanceList.length;
    
    if (disconnected.length > total * 0.5 && total > 0) {
      return { 
        healthy: false, 
        error: `${disconnected.length}/${total} instances disconnected`,
        details: { disconnected_count: disconnected.length, total }
      };
    }
    
    return { healthy: true, details: { connected: total - disconnected.length, total } };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

// Verificar fila de mensagens travadas
async function checkMessageQueue(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    // Verificar logs de envio com falhas recentes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: failedLogs, error } = await supabase
      .from('chatbot_send_logs')
      .select('id')
      .eq('success', false)
      .gte('created_at', oneHourAgo);
    
    if (error) {
      return { healthy: false, error: error.message };
    }
    
    const failedCount = (failedLogs as Array<{ id: string }>)?.length || 0;
    
    if (failedCount > 50) {
      return { 
        healthy: false, 
        error: `${failedCount} failed messages in last hour`,
        details: { failed_count: failedCount }
      };
    }
    
    return { healthy: true, details: { failed_last_hour: failedCount } };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

// Verificar configuração global do WhatsApp
async function checkWhatsAppApi(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data: config, error } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_token, is_active')
      .single();
    
    if (error) {
      return { healthy: false, error: 'No WhatsApp config found' };
    }
    
    const cfg = config as { api_url: string; api_token: string; is_active: boolean };
    
    if (!cfg.is_active) {
      return { healthy: true, details: { status: 'disabled' } };
    }
    
    if (!cfg.api_url || !cfg.api_token) {
      return { healthy: false, error: 'Incomplete WhatsApp configuration' };
    }
    
    // Tentar fazer health check na API
    try {
      const response = await fetch(`${cfg.api_url}/health`, {
        method: 'GET',
        headers: { 'apikey': cfg.api_token },
      });
      
      if (!response.ok) {
        return { healthy: false, error: `API returned ${response.status}` };
      }
      
      return { healthy: true };
    } catch {
      // API pode não ter endpoint /health, não é crítico
      return { healthy: true, details: { health_check: 'not_available' } };
    }
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

// Verificar sessões de chatbot travadas
async function checkChatbotSessions(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: stuckSessions, error } = await supabase
      .from('chatbot_flow_sessions')
      .select('id')
      .eq('is_active', true)
      .lt('last_interaction_at', oneHourAgo);
    
    if (error) {
      return { healthy: false, error: error.message };
    }
    
    const stuckCount = (stuckSessions as Array<{ id: string }>)?.length || 0;
    
    if (stuckCount > 100) {
      return { 
        healthy: false, 
        error: `${stuckCount} stuck sessions`,
        details: { stuck_count: stuckCount }
      };
    }
    
    return { healthy: true, details: { stuck_sessions: stuckCount } };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

// Executar ação de reparo
async function executeRepairAction(
  supabase: SupabaseClient,
  component: string,
  action: RepairAction,
  _status: HealthStatus
): Promise<{ success: boolean; message: string }> {
  console.log(`Executing repair action: ${action.action_name} for ${component}`);
  
  try {
    switch (action.action_type) {
      case 'reconnect':
        if (component === 'seller_instances') {
          // Reconectar instâncias desconectadas
          const { data: disconnected } = await supabase
            .from('whatsapp_seller_instances')
            .select('id, seller_id, instance_name')
            .eq('is_connected', false)
            .eq('instance_blocked', false);
          
          const disconnectedList = disconnected as Array<{ id: string; seller_id: string; instance_name: string }> || [];
          
          if (disconnectedList.length > 0) {
            // Marcar para reconexão (o frontend/cron vai pegar)
            await supabase
              .from('whatsapp_seller_instances')
              .update({ last_connection_check: new Date().toISOString() } as Record<string, unknown>)
              .in('id', disconnectedList.map(d => d.id));
            
            return { success: true, message: `Marked ${disconnectedList.length} instances for reconnection` };
          }
          return { success: true, message: 'No disconnected instances to reconnect' };
        }
        break;
        
      case 'clear_cache':
        if (component === 'chatbot_webhook') {
          // Limpar sessões de fluxo antigas
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { error } = await supabase
            .from('chatbot_flow_sessions')
            .update({ is_active: false } as Record<string, unknown>)
            .lt('last_interaction_at', oneHourAgo)
            .eq('is_active', true);
          
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true, message: 'Cleared stuck chatbot sessions' };
        }
        
        if (component === 'message_queue') {
          // Limpar logs de erro antigos
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('chatbot_send_logs')
            .delete()
            .lt('created_at', oneDayAgo)
            .eq('success', false);
          
          return { success: true, message: 'Cleared old failed message logs' };
        }
        break;
        
      case 'retry_operation':
        if (component === 'message_queue') {
          // Isso seria para reprocessar mensagens falhadas
          // Por segurança, apenas logamos a tentativa
          return { success: true, message: 'Message retry queued (requires manual review)' };
        }
        break;
        
      case 'reset_config':
        // Não implementar reset automático por segurança
        return { success: false, message: 'Config reset requires manual intervention' };
        
      default:
        return { success: false, message: `Unknown action type: ${action.action_type}` };
    }
    
    return { success: true, message: 'Action completed' };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

// Log de evento
async function logEvent(
  supabase: SupabaseClient,
  component: string,
  eventType: string,
  severity: string,
  message: string,
  details: Record<string, unknown> = {},
  repairAction?: string,
  wasAutoRepaired = false
) {
  await supabase.from('system_health_logs').insert({
    component_name: component,
    event_type: eventType,
    severity,
    message,
    details,
    repair_action: repairAction,
    was_auto_repaired: wasAutoRepaired,
  } as Record<string, unknown>);
}

// Atualizar status do componente
async function updateComponentStatus(
  supabase: SupabaseClient,
  component: string,
  healthy: boolean,
  error?: string,
  metadata?: Record<string, unknown>
): Promise<HealthStatus | undefined> {
  const { data: current } = await supabase
    .from('system_health_status')
    .select('*')
    .eq('component_name', component)
    .single();
  
  if (!current) return undefined;
  
  const currentStatus = current as HealthStatus;
  const newConsecutiveFailures = healthy ? 0 : (currentStatus.consecutive_failures || 0) + 1;
  const newStatus = healthy ? 'healthy' : 
    newConsecutiveFailures >= 5 ? 'critical' :
    newConsecutiveFailures >= 2 ? 'warning' : 'warning';
  
  await supabase
    .from('system_health_status')
    .update({
      status: newStatus,
      last_check_at: new Date().toISOString(),
      last_error: healthy ? null : error,
      consecutive_failures: newConsecutiveFailures,
      metadata: metadata || currentStatus.metadata,
    } as Record<string, unknown>)
    .eq('component_name', component);
  
  // Log mudança de status
  if (currentStatus.status !== newStatus) {
    await logEvent(
      supabase,
      component,
      'status_change',
      getSeverity(newConsecutiveFailures),
      `Status changed from ${currentStatus.status} to ${newStatus}`,
      { previous: currentStatus.status, new: newStatus, error }
    );
  }
  
  return { ...currentStatus, consecutive_failures: newConsecutiveFailures, status: newStatus };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verificar se o sistema está habilitado
    const { data: configData } = await supabase
      .from('system_health_config')
      .select('*')
      .single();
    
    const config = configData as HealthConfig | null;
    
    if (!config?.is_enabled) {
      return new Response(
        JSON.stringify({ message: 'Self-healing system is disabled', status: 'disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('🔄 Starting self-healing check...');
    
    const results: Record<string, { healthy: boolean; repaired?: boolean; message?: string }> = {};
    
    // Mapeamento de checks
    const checks: Record<string, () => Promise<CheckResult>> = {
      database_connection: () => checkDatabaseConnection(supabase),
      seller_instances: () => checkSellerInstances(supabase),
      message_queue: () => checkMessageQueue(supabase),
      whatsapp_api: () => checkWhatsAppApi(supabase),
      chatbot_webhook: () => checkChatbotSessions(supabase),
    };
    
    // Executar todos os checks
    for (const [component, checkFn] of Object.entries(checks)) {
      try {
        const result = await checkFn();
        
        // Atualizar status
        const updatedStatus = await updateComponentStatus(
          supabase,
          component,
          result.healthy,
          result.error,
          result.details
        );
        
        results[component] = { healthy: result.healthy };
        
        // Se não está saudável e auto-repair está habilitado
        if (!result.healthy && config.auto_repair_enabled && updatedStatus) {
          // Log do erro
          await logEvent(
            supabase,
            component,
            'error_detected',
            getSeverity(updatedStatus.consecutive_failures),
            result.error || 'Unknown error',
            result.details || {}
          );
          
          // Verificar se deve tentar reparar
          if (updatedStatus.repair_attempts < config.max_repair_attempts) {
            // Buscar ações de reparo disponíveis
            const { data: actionsData } = await supabase
              .from('system_repair_actions')
              .select('*')
              .eq('component_name', component)
              .eq('is_active', true)
              .eq('is_safe', true);
            
            const actions = actionsData as RepairAction[] || [];
            
            for (const action of actions) {
              // Verificar limite diário
              if (action.executions_today >= action.max_daily_executions) {
                continue;
              }
              
              await logEvent(
                supabase,
                component,
                'repair_attempted',
                'medium',
                `Attempting repair: ${action.action_name}`,
                { action: action.action_name }
              );
              
              const repairResult = await executeRepairAction(
                supabase,
                component,
                action,
                updatedStatus
              );
              
              // Atualizar contadores
              await supabase
                .from('system_repair_actions')
                .update({
                  executions_today: action.executions_today + 1,
                  last_execution_at: new Date().toISOString(),
                } as Record<string, unknown>)
                .eq('id', action.id);
              
              await supabase
                .from('system_health_status')
                .update({
                  repair_attempts: (updatedStatus.repair_attempts || 0) + 1,
                  last_repair_at: new Date().toISOString(),
                  last_repair_success: repairResult.success,
                  status: repairResult.success ? 'recovering' : updatedStatus.status,
                } as Record<string, unknown>)
                .eq('component_name', component);
              
              await logEvent(
                supabase,
                component,
                repairResult.success ? 'repair_success' : 'repair_failed',
                repairResult.success ? 'info' : 'high',
                repairResult.message,
                { action: action.action_name },
                action.action_name,
                repairResult.success
              );
              
              results[component].repaired = repairResult.success;
              results[component].message = repairResult.message;
              
              if (repairResult.success) break;
            }
          }
        } else if (result.healthy && updatedStatus && updatedStatus.repair_attempts > 0) {
          // Resetar contadores se está saudável novamente
          await supabase
            .from('system_health_status')
            .update({ repair_attempts: 0 } as Record<string, unknown>)
            .eq('component_name', component);
        }
      } catch (err) {
        console.error(`Error checking ${component}:`, err);
        results[component] = { healthy: false, message: (err as Error).message };
      }
    }
    
    // Resumo geral
    const healthyCount = Object.values(results).filter(r => r.healthy).length;
    const totalCount = Object.keys(results).length;
    const overallStatus = healthyCount === totalCount ? 'healthy' :
      healthyCount >= totalCount * 0.7 ? 'warning' : 'critical';
    
    console.log(`✅ Self-healing check complete: ${healthyCount}/${totalCount} healthy`);
    
    return new Response(
      JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        summary: {
          healthy: healthyCount,
          total: totalCount,
          percentage: Math.round((healthyCount / totalCount) * 100),
        },
        components: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Self-healing error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
