import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Debug function to analyze messages sent for a specific seller
 * Query params:
 * - seller_name: partial name to search (e.g., "SANDEL")
 * - date: specific date to check (YYYY-MM-DD), defaults to today
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const sellerName = url.searchParams.get('seller_name') || 'SANDEL';
    const targetDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    console.log(`[debug-seller-messages] Analyzing seller: ${sellerName}, date: ${targetDate}`);

    // 1. Find the seller
    const { data: sellers, error: sellerError } = await supabase
      .from('profiles')
      .select('id, full_name, company_name, whatsapp')
      .or(`full_name.ilike.%${sellerName}%,company_name.ilike.%${sellerName}%`);

    if (sellerError) {
      throw new Error(`Error finding seller: ${sellerError.message}`);
    }

    if (!sellers || sellers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `No seller found with name containing "${sellerName}"` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const seller = sellers[0];
    console.log(`[debug-seller-messages] Found seller: ${seller.full_name} (${seller.id})`);

    // 2. Check WhatsApp instance status
    const { data: instances } = await supabase
      .from('whatsapp_seller_instances')
      .select('instance_name, status, is_connected, base_url')
      .eq('seller_id', seller.id);

    const connectedInstance = instances?.find(i => i.status === 'connected' || i.is_connected);

    // 3. Get clients expiring on target date
    const { data: expiringClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, phone, expiration_date, is_paid, is_test')
      .eq('seller_id', seller.id)
      .eq('expiration_date', targetDate)
      .eq('is_archived', false);

    if (clientsError) {
      console.error('[debug-seller-messages] Error fetching clients:', clientsError);
    }

    // 4. Get notifications sent on target date
    const startOfDay = `${targetDate}T00:00:00.000Z`;
    const endOfDay = `${targetDate}T23:59:59.999Z`;

    const { data: notifications, error: notifError } = await supabase
      .from('client_notification_tracking')
      .select(`
        id,
        client_id,
        notification_type,
        sent_at,
        sent_via,
        expiration_cycle_date,
        clients (
          name,
          phone
        )
      `)
      .eq('seller_id', seller.id)
      .gte('sent_at', startOfDay)
      .lte('sent_at', endOfDay)
      .order('sent_at', { ascending: false });

    if (notifError) {
      console.error('[debug-seller-messages] Error fetching notifications:', notifError);
    }

    // 5. Get all notifications for expiration_cycle_date = targetDate (regardless of when sent)
    const { data: cycleNotifications } = await supabase
      .from('client_notification_tracking')
      .select(`
        id,
        client_id,
        notification_type,
        sent_at,
        sent_via,
        clients (
          name,
          phone
        )
      `)
      .eq('seller_id', seller.id)
      .eq('expiration_cycle_date', targetDate);

    // 6. Get command logs (WhatsApp commands) for the day
    const { data: commandLogs } = await supabase
      .from('command_logs')
      .select('id, command_text, sender_phone, success, error_message, created_at')
      .eq('owner_id', seller.id)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false })
      .limit(20);

    // 7. Get test generation logs for the day
    const { data: testLogs } = await supabase
      .from('test_generation_log')
      .select('id, sender_phone, test_name, client_created, notified_20min, created_at, expiration_datetime')
      .eq('seller_id', seller.id)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    // 8. Check automation settings
    const { data: automationSettings } = await supabase
      .from('whatsapp_automation_settings')
      .select('*')
      .eq('seller_id', seller.id)
      .maybeSingle();

    // 9. Check notification settings
    const { data: notifSettings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('seller_id', seller.id)
      .maybeSingle();

    // Analyze results
    const analysis = {
      seller: {
        id: seller.id,
        name: seller.full_name,
        company: seller.company_name,
        phone: seller.whatsapp,
      },
      whatsapp_instance: connectedInstance ? {
        name: connectedInstance.instance_name,
        status: connectedInstance.status,
        connected: connectedInstance.is_connected,
        base_url: connectedInstance.base_url,
      } : null,
      date_analyzed: targetDate,
      clients_expiring_today: {
        total: expiringClients?.length || 0,
        with_phone: expiringClients?.filter(c => c.phone)?.length || 0,
        without_phone: expiringClients?.filter(c => !c.phone)?.length || 0,
        paid: expiringClients?.filter(c => c.is_paid)?.length || 0,
        unpaid: expiringClients?.filter(c => !c.is_paid)?.length || 0,
        tests: expiringClients?.filter(c => c.is_test)?.length || 0,
        list: expiringClients?.map(c => ({
          name: c.name,
          phone: c.phone,
          is_paid: c.is_paid,
          is_test: c.is_test,
        })) || [],
      },
      notifications_sent_today: {
        total: notifications?.length || 0,
        by_type: {} as Record<string, number>,
        list: notifications?.map(n => ({
          client: (n.clients as any)?.name,
          type: n.notification_type,
          sent_at: n.sent_at,
          via: n.sent_via,
        })) || [],
      },
      notifications_for_expiration_cycle: {
        total: cycleNotifications?.length || 0,
        list: cycleNotifications?.map(n => ({
          client: (n.clients as any)?.name,
          type: n.notification_type,
          sent_at: n.sent_at,
        })) || [],
      },
      command_logs: {
        total: commandLogs?.length || 0,
        successful: commandLogs?.filter(c => c.success)?.length || 0,
        failed: commandLogs?.filter(c => !c.success)?.length || 0,
      },
      test_generation: {
        total: testLogs?.length || 0,
        clients_created: testLogs?.filter(t => t.client_created)?.length || 0,
        notified_20min: testLogs?.filter(t => t.notified_20min)?.length || 0,
      },
      automation_enabled: automationSettings?.is_enabled || false,
      notification_settings: notifSettings ? {
        iptv_enabled: notifSettings.iptv_enabled,
        days_before: notifSettings.days_before,
      } : null,
      issues_detected: [] as string[],
    };

    // Count by notification type
    notifications?.forEach(n => {
      const type = n.notification_type;
      analysis.notifications_sent_today.by_type[type] = (analysis.notifications_sent_today.by_type[type] || 0) + 1;
    });

    // Detect issues
    if (!connectedInstance) {
      analysis.issues_detected.push('❌ Nenhuma instância WhatsApp conectada - mensagens NÃO podem ser enviadas');
    }

    if (!automationSettings?.is_enabled) {
      analysis.issues_detected.push('⚠️ Automação WhatsApp desativada');
    }

    const clientsWithPhone = expiringClients?.filter(c => c.phone && !c.is_paid) || [];
    const clientsNotified = cycleNotifications?.length || 0;
    
    if (clientsWithPhone.length > 0 && clientsNotified === 0) {
      analysis.issues_detected.push(`⚠️ ${clientsWithPhone.length} cliente(s) com telefone vencendo hoje, mas NENHUMA notificação enviada`);
    } else if (clientsWithPhone.length > clientsNotified) {
      analysis.issues_detected.push(`⚠️ ${clientsWithPhone.length - clientsNotified} cliente(s) podem não ter recebido notificação`);
    }

    if (analysis.issues_detected.length === 0) {
      analysis.issues_detected.push('✅ Nenhum problema detectado');
    }

    console.log(`[debug-seller-messages] Analysis complete:`, JSON.stringify(analysis, null, 2));

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[debug-seller-messages] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
