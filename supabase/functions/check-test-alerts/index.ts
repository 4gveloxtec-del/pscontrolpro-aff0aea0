import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: check-test-alerts
 * 
 * Verifica testes que vencem em 20 minutos e envia alertas via WhatsApp.
 * Deve ser chamada via CRON a cada 5 minutos.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[check-test-alerts] Starting alert check...');

    // Buscar testes que vencem em até 20 minutos e ainda não foram notificados
    const now = new Date();
    const in20min = new Date(now.getTime() + 20 * 60 * 1000);

    // Buscar de AMBAS as fontes: test_generation_log E clients com is_test=true
    // Priorizar clients pois tem expiration_datetime mais preciso
    const { data: expiringTests, error: testsError } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        phone,
        login,
        expiration_datetime,
        seller_id,
        is_test,
        profiles:seller_id (
          id,
          company_name,
          whatsapp_seller_instances (
            instance_name,
            is_connected
          )
        )
      `)
      .eq('is_test', true)
      .lte('expiration_datetime', in20min.toISOString())
      .gt('expiration_datetime', now.toISOString());

    if (testsError) {
      console.error('[check-test-alerts] Error fetching tests:', testsError);
      throw testsError;
    }

    console.log(`[check-test-alerts] Found ${expiringTests?.length || 0} tests expiring soon`);

    // Buscar logs que precisam de notificação
    const { data: pendingLogs, error: logsError } = await supabase
      .from('test_generation_log')
      .select('id, sender_phone, username, seller_id, expiration_datetime, test_name')
      .eq('notified_20min', false)
      .eq('client_created', true)
      .lte('expiration_datetime', in20min.toISOString())
      .gt('expiration_datetime', now.toISOString());

    if (logsError) {
      console.error('[check-test-alerts] Error fetching logs:', logsError);
    }

    const alertsSent: string[] = [];
    const alertsFailed: string[] = [];

    // Processar cada teste que precisa de alerta
    for (const test of (expiringTests || [])) {
      // profiles vem como array de relacionamentos
      const profileData = test.profiles;
      const profile = Array.isArray(profileData) ? profileData[0] : profileData;
      
      if (!profile || !test.phone) continue;

      const instances = profile.whatsapp_seller_instances;
      const instance = Array.isArray(instances) ? instances[0] : null;
      
      if (!instance?.is_connected) {
        console.log(`[check-test-alerts] Seller ${test.seller_id} has no connected instance, skipping`);
        continue;
      }

      // Calcular tempo restante
      const expireTime = new Date(test.expiration_datetime!);
      const diffMs = expireTime.getTime() - now.getTime();
      const minutes = Math.floor(diffMs / (1000 * 60));

      // Montar mensagem de alerta
      const message = `⚠️ *Atenção!*

Seu teste IPTV vence em *${minutes} minutos*!

${test.login ? `🔑 Usuário: ${test.login}` : ''}

Gostou do serviço? Entre em contato para conhecer nossos planos! 📺

_${profile.company_name || 'Equipe de Suporte'}_`;

      try {
        // Buscar configuração global da Evolution API
        const { data: globalConfig } = await supabase
          .from('whatsapp_global_config')
          .select('api_url, api_key')
          .single();

        if (!globalConfig?.api_url || !globalConfig?.api_key) {
          console.log('[check-test-alerts] No global WhatsApp config found');
          continue;
        }

        // Enviar mensagem via Evolution API
        const response = await fetch(
          `${globalConfig.api_url}/message/sendText/${instance.instance_name}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': globalConfig.api_key,
            },
            body: JSON.stringify({
              number: test.phone,
              text: message,
            }),
          }
        );

        if (response.ok) {
          alertsSent.push(test.phone);
          console.log(`[check-test-alerts] ✅ Alert sent to ${test.phone}`);
        } else {
          const errorText = await response.text();
          alertsFailed.push(test.phone);
          console.error(`[check-test-alerts] ❌ Failed to send to ${test.phone}:`, errorText);
        }
      } catch (sendError) {
        alertsFailed.push(test.phone);
        console.error(`[check-test-alerts] ❌ Error sending to ${test.phone}:`, sendError);
      }
    }

    // Marcar logs como notificados
    if (pendingLogs && pendingLogs.length > 0) {
      const logIds = pendingLogs.map(l => l.id);
      await supabase
        .from('test_generation_log')
        .update({ notified_20min: true })
        .in('id', logIds);
      
      console.log(`[check-test-alerts] Marked ${logIds.length} logs as notified`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked_at: now.toISOString(),
        tests_found: expiringTests?.length || 0,
        alerts_sent: alertsSent.length,
        alerts_failed: alertsFailed.length,
        details: { sent: alertsSent, failed: alertsFailed },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-test-alerts] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
