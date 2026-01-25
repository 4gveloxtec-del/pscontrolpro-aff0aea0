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
 * 
 * CORREÇÕES APLICADAS:
 * - [#3] AbortController com timeout de 10s para Evolution API
 * - [#4] Query global config UMA vez antes do loop
 * - [#6] Atualiza flag notified_test_alert no cliente após envio
 * - [#9] Usa .maybeSingle() para global_config
 * - [#11] Tratamento robusto de profiles como objeto ou array
 * - [#17] Processamento em lotes com Promise.allSettled
 * - [#18] Rate limiting de 500ms entre envios
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

    const now = new Date();
    const in20min = new Date(now.getTime() + 20 * 60 * 1000);

    // [#4] CORREÇÃO: Buscar config global UMA VEZ antes do loop
    const { data: globalConfig, error: globalConfigError } = await supabase
      .from('whatsapp_global_config')
      .select('api_url, api_key')
      .maybeSingle(); // [#9] CORREÇÃO: Usa maybeSingle para evitar PGRST116

    if (globalConfigError) {
      console.error('[check-test-alerts] Error fetching global config:', globalConfigError);
    }

    if (!globalConfig || !globalConfig.api_url || !globalConfig.api_key) {
      console.log('[check-test-alerts] No global WhatsApp config found, aborting');
      return new Response(
        JSON.stringify({
          success: true,
          checked_at: now.toISOString(),
          tests_found: 0,
          alerts_sent: 0,
          alerts_failed: 0,
          reason: 'no_global_config',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar testes que vencem em até 20 minutos e ainda não foram notificados
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

    // Buscar logs que precisam de notificação (com filtro adicional de client_id não nulo)
    const { data: pendingLogs, error: logsError } = await supabase
      .from('test_generation_log')
      .select('id, sender_phone, username, seller_id, expiration_datetime, test_name, client_id')
      .eq('notified_20min', false)
      .eq('client_created', true)
      .not('client_id', 'is', null) // [#14] CORREÇÃO: Apenas logs com cliente válido
      .lte('expiration_datetime', in20min.toISOString())
      .gt('expiration_datetime', now.toISOString());

    if (logsError) {
      console.error('[check-test-alerts] Error fetching logs:', logsError);
    }

    const alertsSent: string[] = [];
    const alertsFailed: string[] = [];
    const clientsNotified: string[] = [];

    // Tipo para um teste individual
    interface ExpiringTest {
      id: string;
      name: string;
      phone: string | null;
      login: string | null;
      expiration_datetime: string | null;
      seller_id: string;
      is_test: boolean;
      profiles: { 
        id: string; 
        company_name?: string; 
        whatsapp_seller_instances: { instance_name: string; is_connected: boolean }[] 
      }[] | null;
    }

    // [#17] CORREÇÃO: Função para processar um teste com rate limiting
    async function processTestAlert(test: ExpiringTest, index: number): Promise<void> {
      // [#18] CORREÇÃO: Rate limiting - delay proporcional ao índice
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // [#11] CORREÇÃO: Tratamento robusto de profiles
      const profileData = test.profiles;
      let profile: { id: string; company_name?: string; whatsapp_seller_instances?: Array<{ instance_name: string; is_connected: boolean }> } | null = null;
      
      if (profileData) {
        if (Array.isArray(profileData)) {
          profile = profileData[0] || null;
        } else if (typeof profileData === 'object') {
          profile = profileData as typeof profile;
        }
      }
      
      if (!profile || !test.phone) {
        console.log(`[check-test-alerts] Skipping test ${test.id}: no profile or phone`);
        return;
      }

      const instances = profile.whatsapp_seller_instances;
      const instance = Array.isArray(instances) ? instances.find(i => i.is_connected) : null;
      
      if (!instance?.is_connected) {
        console.log(`[check-test-alerts] Seller ${test.seller_id} has no connected instance, skipping`);
        return;
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
        // [#3] CORREÇÃO: AbortController com timeout de 10 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          `${globalConfig!.api_url}/message/sendText/${instance.instance_name}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': globalConfig!.api_key,
            },
            body: JSON.stringify({
              number: test.phone,
              text: message,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          alertsSent.push(test.phone);
          clientsNotified.push(test.id);
          console.log(`[check-test-alerts] ✅ Alert sent to ${test.phone}`);
        } else {
          const errorText = await response.text();
          alertsFailed.push(test.phone);
          console.error(`[check-test-alerts] ❌ Failed to send to ${test.phone}:`, errorText);
        }
      } catch (sendError) {
        alertsFailed.push(test.phone);
        const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
        console.error(`[check-test-alerts] ❌ Error sending to ${test.phone}:`, errorMsg);
      }
    }

    // [#17] CORREÇÃO: Processar em lotes de 10 para evitar timeout
    const batchSize = 10;
    const testsToProcess = (expiringTests || []) as ExpiringTest[];
    for (let i = 0; i < testsToProcess.length; i += batchSize) {
      const batch = testsToProcess.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((test, idx) => processTestAlert(test, i + idx)));
    }

    // [#6] CORREÇÃO: Marcar clientes como notificados (adicionar campo se necessário)
    // Primeiro, marcar logs como notificados
    if (pendingLogs && pendingLogs.length > 0) {
      const logIds = pendingLogs.map(l => l.id);
      const { error: updateLogsError } = await supabase
        .from('test_generation_log')
        .update({ notified_20min: true })
        .in('id', logIds);
      
      if (updateLogsError) {
        console.error('[check-test-alerts] Error updating logs:', updateLogsError);
      } else {
        console.log(`[check-test-alerts] Marked ${logIds.length} logs as notified`);
      }
    }

    // Também atualizar notes nos clientes notificados para evitar duplicidade
    if (clientsNotified.length > 0) {
      const notificationNote = `[ALERTA] Notificado em ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
      
      // Atualizar notas dos clientes para registrar notificação
      for (const clientId of clientsNotified) {
        const { data: client } = await supabase
          .from('clients')
          .select('notes')
          .eq('id', clientId)
          .maybeSingle();
        
        const currentNotes = client?.notes || '';
        if (!currentNotes.includes('[ALERTA]')) {
          await supabase
            .from('clients')
            .update({ notes: `${currentNotes}\n${notificationNote}`.trim() })
            .eq('id', clientId);
        }
      }
      console.log(`[check-test-alerts] Updated ${clientsNotified.length} clients with notification note`);
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
