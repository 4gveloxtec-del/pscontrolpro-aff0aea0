import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaintenanceReport {
  // Nível 1 - Crítico
  critical_apis_offline: string[];
  critical_tests_moved: number;
  critical_alerts_sent: boolean;
  
  // Nível 2 - Importante
  counters_fixed: number;
  
  // Nível 3 - Manutenção
  alerts_sent: number;
  alerts_failed: number;
  logs_cleaned: number;
  backups_created: number;
  
  // Meta
  started_at: string;
  completed_at: string;
  errors: string[];
  level1_ok: boolean;
  level2_ok: boolean;
  level3_ok: boolean;
}

interface GlobalConfig {
  api_url: string;
  api_key: string;
  default_instance_name?: string;
}

/**
 * Edge Function: daily-maintenance
 * 
 * Manutenção completa automática do PSControl IPTV
 * PRIORIZA ERROS CRÍTICOS PRIMEIRO
 * 
 * 🔴 NÍVEL 1 - CRÍTICO (Imediato):
 *    - APIs mortas → Alerta WhatsApp admin
 *    - Testes fora do lugar → Correção automática
 * 
 * 🟡 NÍVEL 2 - IMPORTANTE:
 *    - Contadores quebrados → Reset
 * 
 * 🟢 NÍVEL 3 - MANUTENÇÃO:
 *    - Alertas 20min
 *    - Limpeza logs
 *    - Backup configs
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const report: MaintenanceReport = {
    critical_apis_offline: [],
    critical_tests_moved: 0,
    critical_alerts_sent: false,
    counters_fixed: 0,
    alerts_sent: 0,
    alerts_failed: 0,
    logs_cleaned: 0,
    backups_created: 0,
    started_at: new Date().toISOString(),
    completed_at: '',
    errors: [],
    level1_ok: true,
    level2_ok: true,
    level3_ok: true,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[daily-maintenance] 🚀 Starting prioritized maintenance...');

    // Buscar config global WhatsApp UMA VEZ
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_key, default_instance_name')
      .maybeSingle() as { data: GlobalConfig | null };

    // Buscar WhatsApp do admin
    let adminPhone: string | null = null;
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);

    if (admins?.[0]) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('whatsapp')
        .eq('id', admins[0].user_id)
        .maybeSingle();
      adminPhone = adminProfile?.whatsapp || null;
    }

    // Helper: Enviar WhatsApp para admin
    async function alertAdmin(message: string) {
      if (!globalConfig?.api_url || !globalConfig?.api_key || !globalConfig?.default_instance_name || !adminPhone) {
        console.log('[daily-maintenance] ⚠️ Cannot send admin alert - missing config');
        return false;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          `${globalConfig.api_url}/message/sendText/${globalConfig.default_instance_name}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': globalConfig.api_key,
            },
            body: JSON.stringify({ number: adminPhone, text: message }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);
        return response.ok;
      } catch (err) {
        console.error('[daily-maintenance] ❌ Admin alert failed:', err);
        return false;
      }
    }

    // ============================================
    // 🔴 NÍVEL 1 - CRÍTICO (IMEDIATO)
    // ============================================
    console.log('[daily-maintenance] 🔴 LEVEL 1: Critical checks...');

    // 1.1 - APIs MORTAS
    const { data: configs } = await supabase
      .from('test_integration_config')
      .select('id, seller_id, server_name, post_endpoint, get_endpoint, api_key, is_active')
      .eq('is_active', true);

    if (configs) {
      for (const config of configs) {
        const serverName = config.server_name || 'Unknown';
        let isOffline = false;

        // Test POST endpoint
        if (config.post_endpoint) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
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
            
            if (!response || response.status === 404 || response.status >= 500) {
              isOffline = true;
              console.log(`[daily-maintenance] 🚨 ${serverName} POST OFFLINE (${response?.status || 'timeout'})`);
            } else {
              console.log(`[daily-maintenance] ✅ ${serverName} POST OK`);
            }
          } catch {
            isOffline = true;
            console.log(`[daily-maintenance] 🚨 ${serverName} POST TIMEOUT`);
          }
        }

        // Test GET endpoint if POST failed or doesn't exist
        if ((isOffline || !config.post_endpoint) && config.get_endpoint) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(config.get_endpoint, {
              method: 'GET',
              headers: {
                ...(config.api_key ? { 'Authorization': `Bearer ${config.api_key}` } : {}),
              },
              signal: controller.signal,
            }).catch(() => null);
            
            clearTimeout(timeoutId);
            
            if (!response || response.status === 404 || response.status >= 500) {
              isOffline = true;
            } else {
              isOffline = false; // GET works, API is partially online
              console.log(`[daily-maintenance] ✅ ${serverName} GET OK`);
            }
          } catch {
            // Keep isOffline as true
          }
        }

        if (isOffline) {
          report.critical_apis_offline.push(serverName);
        }
      }

      // ALERTA IMEDIATO se APIs críticas offline
      if (report.critical_apis_offline.length > 0) {
        report.level1_ok = false;
        const criticalMessage = `🚨 *ALERTA CRÍTICO PSControl*\n\n${report.critical_apis_offline.length} API(s) OFFLINE:\n${report.critical_apis_offline.map(n => `❌ ${n}`).join('\n')}\n\n⚠️ Verifique imediatamente!`;
        
        const sent = await alertAdmin(criticalMessage);
        report.critical_alerts_sent = sent;
        console.log(`[daily-maintenance] 🚨 Critical alert sent: ${sent}`);
      }
    }

    // 1.2 - TESTES FORA DO LUGAR (correção automática)
    console.log('[daily-maintenance] 🔍 Checking misplaced tests...');
    
    // Buscar testes onde category não corresponde ao servidor
    const { data: allTestLogs } = await supabase
      .from('test_generation_log')
      .select('id, seller_id, server_id, category, test_name')
      .eq('client_created', true);

    if (allTestLogs) {
      // Buscar configs para mapear server_id -> category esperada
      const { data: serverConfigs } = await supabase
        .from('test_integration_config')
        .select('server_id, category');

      const serverCategoryMap = new Map<string, string>();
      serverConfigs?.forEach(cfg => {
        if (cfg.server_id) {
          serverCategoryMap.set(cfg.server_id, cfg.category || 'IPTV');
        }
      });

      // Corrigir categorias erradas
      for (const log of allTestLogs) {
        if (log.server_id && serverCategoryMap.has(log.server_id)) {
          const expectedCategory = serverCategoryMap.get(log.server_id);
          if (expectedCategory && log.category !== expectedCategory) {
            await supabase
              .from('test_generation_log')
              .update({ category: expectedCategory })
              .eq('id', log.id);
            
            report.critical_tests_moved++;
            console.log(`[daily-maintenance] 🔄 Fixed test ${log.id}: ${log.category} → ${expectedCategory}`);
          }
        }
      }
    }

    if (report.critical_tests_moved > 0) {
      console.log(`[daily-maintenance] ✅ Fixed ${report.critical_tests_moved} misplaced tests`);
    }

    // ============================================
    // 🟡 NÍVEL 2 - IMPORTANTE
    // ============================================
    console.log('[daily-maintenance] 🟡 LEVEL 2: Important fixes...');

    // 2.1 - CONTADORES QUEBRADOS
    const { data: allConfigs } = await supabase
      .from('test_integration_config')
      .select('id, seller_id, test_counter');

    if (allConfigs) {
      for (const cfg of allConfigs) {
        const { count: realCount } = await supabase
          .from('test_generation_log')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', cfg.seller_id)
          .eq('client_created', true);

        if (realCount !== null && cfg.test_counter !== realCount) {
          await supabase
            .from('test_integration_config')
            .update({ test_counter: realCount })
            .eq('id', cfg.id);
          
          report.counters_fixed++;
          console.log(`[daily-maintenance] 🔢 Counter fixed: ${cfg.test_counter} → ${realCount}`);
        }
      }
    }

    if (report.counters_fixed > 0) {
      report.level2_ok = report.counters_fixed <= 5; // Mais de 5 indica problema
    }

    // ============================================
    // 🟢 NÍVEL 3 - MANUTENÇÃO
    // ============================================
    console.log('[daily-maintenance] 🟢 LEVEL 3: Routine maintenance...');

    const now = new Date();

    // 3.1 - ALERTAS 20MIN
    if (globalConfig?.api_url && globalConfig?.api_key) {
      const in20min = new Date(now.getTime() + 20 * 60 * 1000);

      const { data: expiringTests } = await supabase
        .from('clients')
        .select(`
          id, name, phone, login, expiration_datetime, seller_id,
          profiles:seller_id (
            company_name,
            whatsapp_seller_instances (instance_name, is_connected)
          )
        `)
        .eq('is_test', true)
        .lte('expiration_datetime', in20min.toISOString())
        .gt('expiration_datetime', now.toISOString());

      if (expiringTests) {
        for (const test of expiringTests) {
          if (!test.phone) continue;

          const profiles = test.profiles as any;
          const profile = Array.isArray(profiles) ? profiles[0] : profiles;
          const instances = profile?.whatsapp_seller_instances;
          const instance = Array.isArray(instances) ? instances.find((i: any) => i.is_connected) : null;

          if (!instance) continue;

          const expireTime = new Date(test.expiration_datetime!);
          const minutes = Math.floor((expireTime.getTime() - now.getTime()) / (1000 * 60));

          const message = `⚠️ *Atenção!*\n\nSeu teste vence em *${minutes} minutos*!\n\n${test.login ? `🔑 Usuário: ${test.login}` : ''}\n\nGostou? Entre em contato! 📺\n\n_${profile?.company_name || 'Equipe'}_`;

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

            await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
          } catch {
            report.alerts_failed++;
          }
        }
      }
    }

    // 3.2 - LIMPEZA LOGS
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Limpar logs antigos
    const cleanupQueries = [
      supabase.from('command_logs').delete({ count: 'exact' }).lt('created_at', sevenDaysAgo),
      supabase.from('connection_logs').delete({ count: 'exact' }).lt('created_at', sevenDaysAgo),
      supabase.from('bot_engine_message_log').delete({ count: 'exact' }).lt('processed_at', thirtyDaysAgo),
      supabase.from('bot_logs').delete({ count: 'exact' }).lt('created_at', thirtyDaysAgo),
      supabase.from('test_generation_log').delete({ count: 'exact' }).lt('created_at', ninetyDaysAgo),
    ];

    const cleanupResults = await Promise.allSettled(cleanupQueries);
    cleanupResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.count) {
        report.logs_cleaned += result.value.count;
      }
    });

    // 3.3 - RESOLVER ALERTAS ANTIGOS
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    await Promise.all([
      supabase.from('connection_alerts').update({ is_resolved: true, resolved_at: now.toISOString() })
        .lt('created_at', oneDayAgo).eq('is_resolved', false),
      supabase.from('operational_alerts').update({ is_resolved: true, resolved_at: now.toISOString() })
        .lt('created_at', oneDayAgo).eq('is_resolved', false),
    ]);

    // 3.4 - BACKUP CONFIGS
    const { data: configBackup } = await supabase
      .from('test_integration_config')
      .select('*');
    report.backups_created = configBackup?.length || 0;

    // ============================================
    // RELATÓRIO FINAL
    // ============================================
    report.completed_at = new Date().toISOString();
    const reportDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Determinar nível geral
    const hasCritical = report.critical_apis_offline.length > 0;
    const hasImportant = report.counters_fixed > 5 || report.critical_tests_moved > 10;

    let statusEmoji = '✅';
    let statusText = 'OK';
    if (hasCritical) {
      statusEmoji = '🚨';
      statusText = 'CRÍTICO';
    } else if (hasImportant) {
      statusEmoji = '🟡';
      statusText = 'ATENÇÃO';
    }

    const finalReport = `${statusEmoji} *MANUTENÇÃO DIÁRIA PSControl*

🔴 *CRÍTICOS*: ${report.critical_apis_offline.length > 0 ? `${report.critical_apis_offline.length} APIs off` : 'OK'} | ${report.critical_tests_moved > 0 ? `${report.critical_tests_moved} testes corrigidos` : 'OK'}
🟡 *IMPORTANTE*: ${report.counters_fixed} contadores reset
🟢 *MANUTENÇÃO*: Alertas ${report.alerts_sent} | Logs limpos ${report.logs_cleaned}

⏰ ${reportDate}
📊 Status: ${statusText}`;

    // Enviar relatório apenas se houver algo relevante ou erros
    if (hasCritical || hasImportant || report.errors.length > 0) {
      await alertAdmin(finalReport);
    }

    console.log('[daily-maintenance] 🎉 Maintenance completed!');
    console.log('[daily-maintenance] Report:', JSON.stringify(report, null, 2));

    return new Response(
      JSON.stringify({ success: true, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[daily-maintenance] ❌ Critical error:', error);
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.completed_at = new Date().toISOString();

    return new Response(
      JSON.stringify({ success: false, report, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
