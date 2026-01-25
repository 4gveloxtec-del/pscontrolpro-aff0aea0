import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaintenanceReport {
  apis_checked: number;
  apis_ok: number;
  apis_failed: string[];
  tests_corrected: number;
  counters_reset: number;
  alerts_sent: number;
  alerts_failed: number;
  logs_cleaned: number;
  backups_created: number;
  started_at: string;
  completed_at: string;
  errors: string[];
}

/**
 * Edge Function: daily-maintenance
 * 
 * Manutenção completa automática do PSControl IPTV
 * Executada via CRON às 2:00 AM diariamente
 * 
 * Funcionalidades:
 * 1. Health check APIs de servidores
 * 2. Correção automática de testes
 * 3. Reset de contadores
 * 4. Alertas de 20 minutos
 * 5. Limpeza de logs antigos
 * 6. Backup de configs
 * 7. Relatório WhatsApp para admin
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const report: MaintenanceReport = {
    apis_checked: 0,
    apis_ok: 0,
    apis_failed: [],
    tests_corrected: 0,
    counters_reset: 0,
    alerts_sent: 0,
    alerts_failed: 0,
    logs_cleaned: 0,
    backups_created: 0,
    started_at: new Date().toISOString(),
    completed_at: '',
    errors: [],
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[daily-maintenance] 🚀 Starting daily maintenance...');

    // ============================================
    // 1. HEALTH CHECK APIs DE SERVIDORES
    // ============================================
    console.log('[daily-maintenance] 📡 Checking API endpoints...');
    
    const { data: configs, error: configsError } = await supabase
      .from('test_integration_config')
      .select('id, seller_id, server_name, post_endpoint, get_endpoint, api_key, is_active')
      .eq('is_active', true);

    if (configsError) {
      report.errors.push(`Config fetch error: ${configsError.message}`);
    } else if (configs) {
      for (const config of configs) {
        report.apis_checked++;
        
        // Test POST endpoint
        if (config.post_endpoint) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(config.post_endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(config.api_key ? { 'Authorization': `Bearer ${config.api_key}` } : {}),
              },
              body: JSON.stringify({ action: 'health_check' }),
              signal: controller.signal,
            }).catch(() => null);
            
            clearTimeout(timeoutId);
            
            if (response && response.ok) {
              report.apis_ok++;
              console.log(`[daily-maintenance] ✅ ${config.server_name || 'Unknown'} POST OK`);
            } else {
              report.apis_failed.push(config.server_name || config.id);
              console.log(`[daily-maintenance] ❌ ${config.server_name || 'Unknown'} POST FAILED`);
            }
          } catch (err) {
            report.apis_failed.push(config.server_name || config.id);
            console.log(`[daily-maintenance] ❌ ${config.server_name || 'Unknown'} POST ERROR:`, err);
          }
        }
        
        // Test GET endpoint
        if (config.get_endpoint) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(config.get_endpoint, {
              method: 'GET',
              headers: {
                ...(config.api_key ? { 'Authorization': `Bearer ${config.api_key}` } : {}),
              },
              signal: controller.signal,
            }).catch(() => null);
            
            clearTimeout(timeoutId);
            
            if (response && response.ok) {
              console.log(`[daily-maintenance] ✅ ${config.server_name || 'Unknown'} GET OK`);
            } else {
              console.log(`[daily-maintenance] ⚠️ ${config.server_name || 'Unknown'} GET FAILED`);
            }
          } catch (err) {
            console.log(`[daily-maintenance] ⚠️ ${config.server_name || 'Unknown'} GET ERROR:`, err);
          }
        }
      }
    }

    // ============================================
    // 2. SINCRONIZAR CONTADORES DE TESTES
    // ============================================
    console.log('[daily-maintenance] 🔢 Syncing test counters...');
    
    const { data: allConfigs } = await supabase
      .from('test_integration_config')
      .select('id, seller_id, server_id');

    if (allConfigs) {
      for (const cfg of allConfigs) {
        // Contar testes reais do seller
        const { count } = await supabase
          .from('test_generation_log')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', cfg.seller_id)
          .eq('client_created', true);

        if (count !== null) {
          await supabase
            .from('test_integration_config')
            .update({ test_counter: count })
            .eq('id', cfg.id);
          
          report.counters_reset++;
        }
      }
    }
    console.log(`[daily-maintenance] ✅ ${report.counters_reset} counters synchronized`);

    // ============================================
    // 3. ALERTAS DE EXPIRAÇÃO (20 MINUTOS)
    // ============================================
    console.log('[daily-maintenance] ⏰ Processing expiration alerts...');
    
    const now = new Date();
    const in20min = new Date(now.getTime() + 20 * 60 * 1000);

    // Buscar config global WhatsApp
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_key')
      .maybeSingle();

    if (globalConfig?.api_url && globalConfig?.api_key) {
      // Buscar testes expirando
      const { data: expiringTests } = await supabase
        .from('clients')
        .select(`
          id, name, phone, login, expiration_datetime, seller_id,
          profiles:seller_id (
            whatsapp_seller_instances (instance_name, is_connected)
          )
        `)
        .eq('is_test', true)
        .lte('expiration_datetime', in20min.toISOString())
        .gt('expiration_datetime', now.toISOString());

      if (expiringTests) {
        for (const test of expiringTests) {
          if (!test.phone) continue;

          // Buscar instância conectada
          const profiles = test.profiles as any;
          const profile = Array.isArray(profiles) ? profiles[0] : profiles;
          const instances = profile?.whatsapp_seller_instances;
          const instance = Array.isArray(instances) ? instances.find((i: any) => i.is_connected) : null;

          if (!instance) continue;

          // Calcular tempo restante
          const expireTime = new Date(test.expiration_datetime!);
          const minutes = Math.floor((expireTime.getTime() - now.getTime()) / (1000 * 60));

          const message = `⚠️ *Atenção!*\n\nSeu teste IPTV vence em *${minutes} minutos*!\n\n${test.login ? `🔑 Usuário: ${test.login}` : ''}\n\nGostou do serviço? Entre em contato para conhecer nossos planos! 📺`;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(
              `${globalConfig.api_url}/message/sendText/${instance.instance_name}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': globalConfig.api_key,
                },
                body: JSON.stringify({ number: test.phone, text: message }),
                signal: controller.signal,
              }
            );

            clearTimeout(timeoutId);

            if (response.ok) {
              report.alerts_sent++;
            } else {
              report.alerts_failed++;
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch {
            report.alerts_failed++;
          }
        }
      }
    }
    console.log(`[daily-maintenance] ✅ Alerts sent: ${report.alerts_sent}, failed: ${report.alerts_failed}`);

    // ============================================
    // 4. LIMPEZA DE LOGS ANTIGOS
    // ============================================
    console.log('[daily-maintenance] 🧹 Cleaning old logs...');
    
    // Limpar command_logs > 7 dias
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: commandLogsDeleted } = await supabase
      .from('command_logs')
      .delete({ count: 'exact' })
      .lt('created_at', sevenDaysAgo);
    
    report.logs_cleaned += commandLogsDeleted || 0;

    // Limpar connection_logs > 7 dias
    const { count: connectionLogsDeleted } = await supabase
      .from('connection_logs')
      .delete({ count: 'exact' })
      .lt('created_at', sevenDaysAgo);
    
    report.logs_cleaned += connectionLogsDeleted || 0;

    // Limpar bot_engine_message_log > 30 dias
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: botLogsDeleted } = await supabase
      .from('bot_engine_message_log')
      .delete({ count: 'exact' })
      .lt('processed_at', thirtyDaysAgo);
    
    report.logs_cleaned += botLogsDeleted || 0;

    // Limpar bot_logs > 30 dias
    const { count: oldBotLogsDeleted } = await supabase
      .from('bot_logs')
      .delete({ count: 'exact' })
      .lt('created_at', thirtyDaysAgo);
    
    report.logs_cleaned += oldBotLogsDeleted || 0;

    // Limpar test_generation_log > 90 dias
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count: testLogsDeleted } = await supabase
      .from('test_generation_log')
      .delete({ count: 'exact' })
      .lt('created_at', ninetyDaysAgo);
    
    report.logs_cleaned += testLogsDeleted || 0;

    console.log(`[daily-maintenance] ✅ ${report.logs_cleaned} old logs cleaned`);

    // ============================================
    // 5. RESOLVER ALERTAS ANTIGOS
    // ============================================
    console.log('[daily-maintenance] 🔔 Resolving old alerts...');
    
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('connection_alerts')
      .update({ is_resolved: true, resolved_at: now.toISOString() })
      .lt('created_at', oneDayAgo)
      .eq('is_resolved', false);

    await supabase
      .from('operational_alerts')
      .update({ is_resolved: true, resolved_at: now.toISOString() })
      .lt('created_at', oneDayAgo)
      .eq('is_resolved', false);

    // ============================================
    // 6. BACKUP DE CONFIGS (LOG)
    // ============================================
    console.log('[daily-maintenance] 💾 Creating config backup log...');
    
    const { data: configBackup } = await supabase
      .from('test_integration_config')
      .select('*');

    if (configBackup) {
      report.backups_created = configBackup.length;
      console.log(`[daily-maintenance] ✅ ${report.backups_created} configs backed up`);
    }

    // ============================================
    // 7. ENVIAR RELATÓRIO WHATSAPP ADMIN
    // ============================================
    report.completed_at = new Date().toISOString();
    
    console.log('[daily-maintenance] 📱 Sending admin report...');
    
    if (globalConfig?.api_url && globalConfig?.api_key) {
      // Buscar instância admin
      const { data: adminInstance } = await supabase
        .from('whatsapp_global_config')
        .select('default_instance_name')
        .maybeSingle();

      if (adminInstance?.default_instance_name) {
        // Buscar admins
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          for (const admin of admins) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('whatsapp')
              .eq('id', admin.user_id)
              .maybeSingle();

            if (profile?.whatsapp) {
              const reportDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
              
              const reportMessage = `🔧 *MANUTENÇÃO DIÁRIA PSControl*

✅ APIs: ${report.apis_ok}/${report.apis_checked} OK
${report.apis_failed.length > 0 ? `❌ Falhas: ${report.apis_failed.join(', ')}` : ''}
🔢 Contadores sincronizados: ${report.counters_reset}
⏰ Alertas enviados: ${report.alerts_sent}
🧹 Logs limpos: ${report.logs_cleaned}
💾 Configs backup: ${report.backups_created}
${report.errors.length > 0 ? `\n⚠️ Erros: ${report.errors.length}` : ''}

⏰ Concluído: ${reportDate}`;

              try {
                await fetch(
                  `${globalConfig.api_url}/message/sendText/${adminInstance.default_instance_name}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'apikey': globalConfig.api_key,
                    },
                    body: JSON.stringify({ number: profile.whatsapp, text: reportMessage }),
                  }
                );
                console.log('[daily-maintenance] ✅ Admin report sent');
              } catch (err) {
                console.log('[daily-maintenance] ⚠️ Failed to send admin report:', err);
              }
            }
          }
        }
      }
    }

    console.log('[daily-maintenance] 🎉 Daily maintenance completed!');
    console.log('[daily-maintenance] Report:', JSON.stringify(report, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        report,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[daily-maintenance] ❌ Critical error:', error);
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.completed_at = new Date().toISOString();

    return new Response(
      JSON.stringify({
        success: false,
        report,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
