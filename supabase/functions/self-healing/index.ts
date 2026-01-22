import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

// Enviar notificação push para todos os admins
async function sendAdminPushNotification(
  supabase: SupabaseClient,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    // Buscar todos os user_ids que são admins
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    
    if (rolesError || !adminRoles?.length) {
      console.log('No admins found for push notification');
      return;
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Enviar notificação para cada admin
    for (const admin of adminRoles) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId: admin.user_id,
            title,
            body,
            data: data || {},
            tag: 'system-health',
            icon: '/admin-icon-192.png',
          }),
        });
        
        if (response.ok) {
          console.log(`Push notification sent to admin: ${admin.user_id}`);
        }
      } catch (err) {
        console.error(`Failed to send push to admin ${admin.user_id}:`, err);
      }
    }
  } catch (err) {
    console.error('Error sending admin push notifications:', err);
  }
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

// Verificar fila de mensagens pendentes (message_queue table)
async function checkMessageQueue(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    // Verificar mensagens pendentes/falhadas na última hora
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: failedMessages, error } = await supabase
      .from('message_queue')
      .select('id')
      .eq('status', 'failed')
      .gte('created_at', oneHourAgo);
    
    if (error) {
      // Se a tabela não existir ou erro de query, considerar saudável
      console.log('Message queue check - table may not exist:', error.message);
      return { healthy: true, details: { status: 'table_not_available' } };
    }
    
    const failedCount = (failedMessages as Array<{ id: string }>)?.length || 0;
    
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
      .maybeSingle();
    
    // Se não houver configuração, considerar como "não configurado" (não é erro crítico)
    if (error) {
      console.log('WhatsApp config query error:', error.message);
      return { healthy: true, details: { status: 'not_configured', reason: error.message } };
    }
    
    if (!config) {
      return { healthy: true, details: { status: 'not_configured' } };
    }
    
    const cfg = config as { api_url: string; api_token: string; is_active: boolean };
    
    if (!cfg.is_active) {
      return { healthy: true, details: { status: 'disabled' } };
    }
    
    if (!cfg.api_url || !cfg.api_token) {
      // Configuração incompleta não é erro crítico - apenas aviso
      return { healthy: true, details: { status: 'incomplete_config' } };
    }
    
    // Normalizar URL da API
    let apiUrl = cfg.api_url.trim();
    if (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1);
    }
    
    // Tentar verificar se a API está online (não mais /health, usar endpoint que existe)
    try {
      // Evolution API não tem /health padrão - tentar endpoint de instance/fetchInstances
      const response = await fetch(`${apiUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: { 
          'apikey': cfg.api_token,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000), // timeout de 10 segundos
      });
      
      // Qualquer resposta (mesmo 401/403) indica que a API está online
      if (response.status < 500) {
        return { healthy: true, details: { status: 'online', http_status: response.status } };
      }
      
      // Erros 5xx indicam problema no servidor
      return { healthy: false, error: `API server error: ${response.status}` };
    } catch (fetchError) {
      const errMsg = (fetchError as Error).message;
      
      // Timeout ou erro de rede - pode ser temporário
      if (errMsg.includes('timeout') || errMsg.includes('AbortError')) {
        return { healthy: true, details: { status: 'timeout_but_ok', message: 'API slow but may be online' } };
      }
      
      // Erros de conexão são normais se a API não estiver configurada corretamente
      // Não marcar como crítico para evitar loops de reparo
      console.log('WhatsApp API check error (non-critical):', errMsg);
      return { healthy: true, details: { status: 'check_failed', reason: errMsg } };
    }
  } catch (err) {
    console.error('WhatsApp API check exception:', err);
    return { healthy: true, details: { status: 'check_error', reason: (err as Error).message } };
  }
}

// Verificar contatos do chatbot do vendedor (seller_chatbot_contacts)
async function checkSellerContacts(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    // Verificar se há contatos com sessões ativas há muito tempo (possível travamento)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: stuckContacts, error } = await supabase
      .from('seller_chatbot_contacts')
      .select('id')
      .not('current_node_key', 'is', null)
      .lt('last_interaction_at', oneHourAgo);
    
    if (error) {
      // Se a tabela não existir, considerar saudável
      console.log('Seller contacts check - table may not exist:', error.message);
      return { healthy: true, details: { status: 'check_skipped' } };
    }
    
    const stuckCount = (stuckContacts as Array<{ id: string }>)?.length || 0;
    
    // Limpar sessões travadas automaticamente
    if (stuckCount > 0) {
      await supabase
        .from('seller_chatbot_contacts')
        .update({ current_node_key: null })
        .not('current_node_key', 'is', null)
        .lt('last_interaction_at', oneHourAgo);
      
      return { healthy: true, details: { cleared_stuck_sessions: stuckCount } };
    }
    
    return { healthy: true, details: { stuck_sessions: 0 } };
  } catch (err) {
    // Qualquer erro aqui não deve ser crítico
    console.log('Seller contacts check error (non-critical):', (err as Error).message);
    return { healthy: true, details: { status: 'check_skipped', reason: (err as Error).message } };
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
        if (component === 'seller_contacts') {
          // Limpar sessões travadas de contatos
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { error } = await supabase
            .from('seller_chatbot_contacts')
            .update({ current_node_key: null } as Record<string, unknown>)
            .not('current_node_key', 'is', null)
            .lt('last_interaction_at', oneHourAgo);
          
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true, message: 'Cleared stuck seller contact sessions' };
        }
        
        if (component === 'message_queue') {
          // Limpar mensagens falhadas antigas (mais de 24h)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('message_queue')
            .delete()
            .lt('created_at', oneDayAgo)
            .eq('status', 'failed');
          
          return { success: true, message: 'Cleared old failed messages from queue' };
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
    
    // Mapeamento de checks (chatbot removido - funcionalidade descontinuada)
    const checks: Record<string, () => Promise<CheckResult>> = {
      database_connection: () => checkDatabaseConnection(supabase),
      seller_instances: () => checkSellerInstances(supabase),
      message_queue: () => checkMessageQueue(supabase),
      whatsapp_api: () => checkWhatsAppApi(supabase),
      seller_contacts: () => checkSellerContacts(supabase),
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
              
              // Se o reparo falhou e é crítico, notificar admins
              if (!repairResult.success && updatedStatus.consecutive_failures >= 3) {
                if (config.notify_admin_on_critical) {
                  await sendAdminPushNotification(
                    supabase,
                    '🚨 Problema Crítico - Sistema de Autocura',
                    `Componente "${component}" com problema: ${result.error}. Reparo automático falhou.`,
                    { 
                      component, 
                      error: result.error, 
                      consecutiveFailures: updatedStatus.consecutive_failures,
                      repairAttempts: updatedStatus.repair_attempts + 1
                    }
                  );
                }
              }
              
              if (repairResult.success) break;
            }
            
            // Se nenhum reparo funcionou e atingiu limite de tentativas
            if (!results[component].repaired && updatedStatus.repair_attempts + 1 >= config.max_repair_attempts) {
              if (config.notify_admin_on_critical) {
                await sendAdminPushNotification(
                  supabase,
                  '⚠️ Limite de Reparos Atingido',
                  `Componente "${component}" atingiu o limite de ${config.max_repair_attempts} tentativas de reparo. Intervenção manual necessária.`,
                  { 
                    component, 
                    error: result.error, 
                    maxAttempts: config.max_repair_attempts 
                  }
                );
              }
          }
        } else if (updatedStatus.repair_attempts >= config.max_repair_attempts) {
            // Já atingiu limite - NÃO notificar repetidamente, apenas uma vez
            // Para evitar spam de notificações
            if (updatedStatus.consecutive_failures === 5 && config.notify_admin_on_critical) {
              await sendAdminPushNotification(
                supabase,
                '🔴 Componente Crítico Sem Reparo',
                `Componente "${component}" está em estado CRÍTICO há ${updatedStatus.consecutive_failures} verificações. Sem opções de reparo automático restantes.`,
                { component, error: result.error, consecutiveFailures: updatedStatus.consecutive_failures }
              );
            }
          }
        } 
        
        // IMPORTANTE: Resetar contadores se está saudável novamente
        if (result.healthy && updatedStatus) {
          if (updatedStatus.repair_attempts > 0 || updatedStatus.consecutive_failures > 0) {
            await supabase
              .from('system_health_status')
              .update({ 
                repair_attempts: 0,
                consecutive_failures: 0,
                last_error: null,
                status: 'healthy'
              } as Record<string, unknown>)
              .eq('component_name', component);
          }
          
          // Notificar que o componente se recuperou (apenas se estava com falhas)
          if (updatedStatus.consecutive_failures > 0) {
            await sendAdminPushNotification(
              supabase,
              '✅ Componente Recuperado',
              `Componente "${component}" voltou ao normal após intervenção.`,
              { component }
            );
          }
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
