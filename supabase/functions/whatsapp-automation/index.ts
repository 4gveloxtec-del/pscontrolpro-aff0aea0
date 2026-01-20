import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout constant for API calls
const API_TIMEOUT_MS = 15000;

interface Client {
  id: string;
  name: string;
  phone: string;
  expiration_date: string;
  seller_id: string;
  category: string;
  plan_name: string;
  plan_price: number;
  has_paid_apps: boolean;
  paid_apps_expiration: string;
  login: string;
  password: string;
  server_name: string;
  is_paid: boolean;
  pending_amount: number;
  expected_payment_date: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  subscription_expires_at: string;
  company_name: string;
  pix_key: string;
}

interface GlobalConfig {
  api_url: string;
  api_token: string;
  is_active: boolean;
}

interface SellerInstance {
  seller_id: string;
  instance_name: string;
  is_connected: boolean;
  auto_send_enabled: boolean;
  instance_blocked: boolean;
}

// Fetch with timeout wrapper
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Send message via Evolution API using global config + seller instance with retry
async function sendEvolutionMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  message: string,
  retries = 1
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let formattedPhone = phone.replace(/\D/g, '');
      if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
        formattedPhone = '55' + formattedPhone;
      }

      const url = `${globalConfig.api_url}/message/sendText/${instanceName}`;
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': globalConfig.api_token,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      });

      console.log(`Message sent to ${formattedPhone} via instance ${instanceName}: ${response.ok}`);
      if (response.ok) {
        return true;
      }
      
      // Retry on 5xx errors
      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return false;
    } catch (error) {
      console.error(`Error sending message (attempt ${attempt + 1}):`, error);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return false;
    }
  }
  return false;
}

// Send push notification as fallback
async function sendPushNotification(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        tag: `automation-${data.clientId || data.resellerId}`,
        data,
      }),
    });

    const result = await response.json();
    return result.sent > 0;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
}

// Replace template variables
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

// Format date to DD/MM/YYYY
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
}

// Calculate days until date
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Calculate days since date (for overdue)
function daysSince(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

// Get notification type label for push
function getNotificationLabel(notificationType: string): { title: string; emoji: string } {
  const labels: Record<string, { title: string; emoji: string }> = {
    'app_vencimento': { title: 'App Vencido', emoji: '🔴' },
    'app_3_dias': { title: 'App Vence em 3 dias', emoji: '🟡' },
    'app_30_dias': { title: 'App Vence em 30 dias', emoji: '🔵' },
    'iptv_vencimento': { title: 'Plano Vencido', emoji: '🔴' },
    'iptv_3_dias': { title: 'Plano Vence em 3 dias', emoji: '🟡' },
    'renovacao': { title: 'Renovação', emoji: '✅' },
    'cobranca': { title: 'Cobrança', emoji: '💰' },
    'payment_overdue_1day': { title: 'Pagamento Atrasado (1 dia)', emoji: '⚠️' },
    'plano_vencimento': { title: 'Sua Assinatura Venceu', emoji: '🔴' },
    'plano_3_dias': { title: 'Sua Assinatura Vence em 3 dias', emoji: '🟡' },
  };
  return labels[notificationType] || { title: 'Notificação', emoji: '📢' };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for test mode in request body
    let testMode = false;
    let testClientId: string | null = null;
    
    try {
      const body = await req.json();
      testMode = body?.testMode === true;
      testClientId = body?.testClientId || null;
    } catch {
      // No body or invalid JSON, proceed normally
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, get global config
    const { data: globalConfigData, error: globalConfigError } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .maybeSingle();

    if (globalConfigError) {
      console.log('Error fetching global config:', globalConfigError.message);
    }

    const globalConfig: GlobalConfig | null = globalConfigData?.is_active ? globalConfigData as GlobalConfig : null;
    const isApiActive = !!globalConfig;

    console.log(`WhatsApp API active: ${isApiActive}, Test mode: ${testMode}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Calculate date ranges
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const in30DaysStr = in30Days.toISOString().split('T')[0];

    // Calculate yesterday for payment overdue check
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log('Running WhatsApp automation...');
    console.log(`Today: ${todayStr}, +3 days: ${in3DaysStr}, +30 days: ${in30DaysStr}, Yesterday: ${yesterdayStr}`);

    // Get all seller instances
    const { data: allSellerInstances } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('auto_send_enabled', true);

    // Separate connected and disconnected instances
    const connectedInstances = (allSellerInstances || []).filter(
      (i: SellerInstance) => i.is_connected && !i.instance_blocked
    );
    const disconnectedSellerIds = (allSellerInstances || [])
      .filter((i: SellerInstance) => !i.is_connected || i.instance_blocked)
      .map((i: SellerInstance) => i.seller_id);

    console.log(`Connected instances: ${connectedInstances.length}, Disconnected sellers: ${disconnectedSellerIds.length}`);

    let totalSent = 0;
    let pushSent = 0;
    const results: any[] = [];

    // Get admin info for reseller notifications
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminIds = adminRoles?.map(r => r.user_id) || [];
    
    // Get admin instance for reseller notifications
    const { data: adminInstance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .in('seller_id', adminIds)
      .eq('is_connected', true)
      .eq('instance_blocked', false)
      .maybeSingle();

    // PART 1: Admin → Reseller notifications (skip in test mode)
    if (adminIds.length > 0 && !testMode) {
      console.log('Processing admin to reseller notifications...');

      const adminId = adminIds[0];

      // Get admin profile for template variables
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminId)
        .single();

      // Get app price
      const { data: appPriceSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_monthly_price')
        .single();

      const appPrice = appPriceSetting?.value || '25';

      // Get resellers expiring in 3 days or today
      const { data: expiringResellers } = await supabase
        .from('profiles')
        .select('*')
        .or(`subscription_expires_at.eq.${todayStr},subscription_expires_at.eq.${in3DaysStr}`)
        .eq('is_active', true);

      // Get admin templates
      const { data: adminTemplates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', adminId);

      for (const reseller of expiringResellers || []) {
        if (!reseller.whatsapp) continue;

        const daysLeft = daysUntil(reseller.subscription_expires_at);

        let notificationType = '';
        let templateType = '';

        if (daysLeft === 0) {
          notificationType = 'plano_vencimento';
          templateType = 'expired';
        } else if (daysLeft === 3) {
          notificationType = 'plano_3_dias';
          templateType = 'expiring_3days';
        } else {
          continue;
        }

        // Check if notification already sent
        const { data: existing } = await supabase
          .from('reseller_notification_tracking')
          .select('id')
          .eq('reseller_id', reseller.id)
          .eq('notification_type', notificationType)
          .eq('expiration_cycle_date', reseller.subscription_expires_at)
          .maybeSingle();

        if (existing) {
          console.log(`Notification ${notificationType} already sent to reseller ${reseller.id}`);
          continue;
        }

        // Find template
        const template = adminTemplates?.find(t => 
          t.type === templateType && t.name.toLowerCase().includes('vendedor')
        );

        let sent = false;

        // Try WhatsApp API first if admin has connected instance
        if (adminInstance && globalConfig) {
          if (template) {
            const message = replaceVariables(template.message, {
              nome: reseller.full_name || 'Revendedor',
              email: reseller.email,
              whatsapp: reseller.whatsapp,
              vencimento: formatDate(reseller.subscription_expires_at),
              valor: appPrice,
              pix: adminProfile?.pix_key || '',
              empresa: adminProfile?.company_name || '',
            });

            sent = await sendEvolutionMessage(
              globalConfig, 
              adminInstance.instance_name, 
              reseller.whatsapp, 
              message
            );
          }
        }

        // Fallback to push notification if API failed or not available
        if (!sent) {
          const { title, emoji } = getNotificationLabel(notificationType);
          sent = await sendPushNotification(
            supabaseUrl,
            supabaseServiceKey,
            reseller.id,
            `${emoji} ${title}`,
            `Sua assinatura vence em ${formatDate(reseller.subscription_expires_at)}. Renove para continuar usando o sistema.`,
            { type: 'reseller-expiration', resellerId: reseller.id }
          );
          if (sent) pushSent++;
        }

        if (sent) {
          await supabase.from('reseller_notification_tracking').insert({
            reseller_id: reseller.id,
            admin_id: adminId,
            notification_type: notificationType,
            expiration_cycle_date: reseller.subscription_expires_at,
          });

          totalSent++;
          results.push({
            type: 'reseller',
            reseller: reseller.full_name,
            notificationType,
            via: pushSent > 0 ? 'push' : 'whatsapp',
          });
        }
      }
    }

    // PART 2: Seller → Client notifications
    // Get all sellers with auto_send enabled (connected or not)
    const { data: allSellers } = await supabase
      .from('whatsapp_seller_instances')
      .select('seller_id')
      .eq('auto_send_enabled', true);

    const allSellerIds = allSellers?.map(s => s.seller_id) || [];

    for (const sellerId of allSellerIds) {
      console.log(`Processing notifications for seller ${sellerId}`);

      // Check if this seller has a connected instance
      const sellerInstance = connectedInstances.find((i: SellerInstance) => i.seller_id === sellerId);
      const canUseApi = !!sellerInstance && !!globalConfig;

      // Get seller profile
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sellerId)
        .single();

      // Get seller templates
      const { data: templates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', sellerId);

      // Get clients expiring in relevant timeframes
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_archived', false)
        .or(`expiration_date.eq.${todayStr},expiration_date.eq.${in3DaysStr},expiration_date.eq.${in30DaysStr}`);

      // Also get clients with pending payment (not paid)
      const { data: unpaidClients } = await supabase
        .from('clients')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_archived', false)
        .eq('is_paid', false)
        .not('pending_amount', 'is', null)
        .gt('pending_amount', 0);

      // Get clients with payment overdue by 1 day (expected_payment_date = yesterday)
      const { data: overdueClients } = await supabase
        .from('clients')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_archived', false)
        .eq('is_paid', false)
        .eq('expected_payment_date', yesterdayStr)
        .not('pending_amount', 'is', null)
        .gt('pending_amount', 0);

      // Combine and deduplicate
      const allClients = [...(clients || [])];
      for (const unpaid of unpaidClients || []) {
        if (!allClients.find(c => c.id === unpaid.id)) {
          allClients.push(unpaid);
        }
      }
      for (const overdue of overdueClients || []) {
        if (!allClients.find(c => c.id === overdue.id)) {
          allClients.push(overdue);
        }
      }

      for (const client of allClients) {
        if (!client.phone) continue;

        // In test mode, only process the specific client if provided
        if (testMode && testClientId && client.id !== testClientId) {
          continue;
        }

        const daysLeft = daysUntil(client.expiration_date);
        const isPaidApp = client.has_paid_apps || client.category === 'Contas Premium';
        const hasUnpaidAmount = !client.is_paid && client.pending_amount > 0;
        
        // Check if payment is 1 day overdue
        const paymentDaysOverdue = client.expected_payment_date ? daysSince(client.expected_payment_date) : 0;
        const isPaymentOverdue1Day = hasUnpaidAmount && paymentDaysOverdue === 1;

        // Determine notification type based on days and service type
        let notificationType = '';
        let templateType = '';

        if (isPaymentOverdue1Day) {
          // Payment overdue by 1 day - NEW NOTIFICATION TYPE
          notificationType = 'payment_overdue_1day';
          templateType = 'payment_overdue_1day';
        } else if (hasUnpaidAmount && daysLeft <= 0) {
          // Cobrança - client expired and has pending payment
          notificationType = 'cobranca';
          templateType = 'billing';
        } else if (daysLeft === 0) {
          notificationType = isPaidApp ? 'app_vencimento' : 'iptv_vencimento';
          templateType = 'expired';
        } else if (daysLeft === 3) {
          notificationType = isPaidApp ? 'app_3_dias' : 'iptv_3_dias';
          templateType = 'expiring_3days';
        } else if (daysLeft === 30 && isPaidApp) {
          // Only paid apps get 30-day notification
          notificationType = 'app_30_dias';
          templateType = 'billing';
        } else {
          continue;
        }

        // In test mode, skip duplicate check and don't record
        if (!testMode) {
          // Check if notification already sent
          const { data: existing } = await supabase
            .from('client_notification_tracking')
            .select('id')
            .eq('client_id', client.id)
            .eq('notification_type', notificationType)
            .eq('expiration_cycle_date', client.expiration_date)
            .maybeSingle();

          if (existing) {
            console.log(`Notification ${notificationType} already sent to client ${client.id}`);
            continue;
          }
        }

        // Find appropriate template
        const categoryLower = (client.category || 'iptv').toLowerCase();
        const template = templates?.find(t => 
          t.type === templateType && t.name.toLowerCase().includes(categoryLower)
        ) || templates?.find(t => t.type === templateType);

        let sent = false;
        let sentVia = 'push';
        let messagePreview = '';

        // Prepare message variables
        const messageVariables = {
          nome: client.name,
          empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
          login: client.login || '',
          senha: client.password || '',
          vencimento: formatDate(client.expiration_date),
          dias_restantes: String(daysLeft),
          valor: String(client.plan_price || 0),
          valor_pendente: String(client.pending_amount || 0),
          data_pagamento: client.expected_payment_date ? formatDate(client.expected_payment_date) : '',
          plano: client.plan_name || '',
          servidor: client.server_name || '',
          pix: sellerProfile?.pix_key || '',
          servico: client.category || 'IPTV',
        };

        // Generate message preview for test mode
        if (template) {
          messagePreview = replaceVariables(template.message, messageVariables);
        }

        // In test mode, just return the preview without sending
        if (testMode) {
          results.push({
            type: 'client',
            seller: sellerId,
            client: client.name,
            phone: client.phone,
            notificationType,
            templateName: template?.name || 'Nenhum template encontrado',
            messagePreview,
            wouldSendVia: canUseApi ? 'whatsapp' : 'push',
          });
          totalSent++;
          continue;
        }

        // Try WhatsApp API first if seller has connected instance
        if (canUseApi && template) {
          const message = replaceVariables(template.message, messageVariables);

          sent = await sendEvolutionMessage(
            globalConfig!, 
            sellerInstance!.instance_name, 
            client.phone, 
            message
          );

          if (sent) sentVia = 'whatsapp';
        }

        // Fallback to push notification if API failed or not available
        if (!sent) {
          const { title, emoji } = getNotificationLabel(notificationType);
          let pushBody = '';
          
          if (notificationType === 'payment_overdue_1day') {
            pushBody = `${client.name} tem R$ ${client.pending_amount} pendente há 1 dia. Data combinada: ${formatDate(client.expected_payment_date)}`;
          } else if (hasUnpaidAmount) {
            pushBody = `${client.name} tem R$ ${client.pending_amount} pendente. Vence: ${formatDate(client.expiration_date)}`;
          } else {
            pushBody = `${client.name} - ${client.plan_name || 'Plano'} - Vence: ${formatDate(client.expiration_date)}`;
          }
          
          sent = await sendPushNotification(
            supabaseUrl,
            supabaseServiceKey,
            sellerId,
            `${emoji} ${title}`,
            pushBody,
            { 
              type: 'client-expiration', 
              clientId: client.id,
              clientName: client.name,
              notificationType
            }
          );
          if (sent) pushSent++;
        }

        if (sent) {
          // Record notification
          await supabase.from('client_notification_tracking').insert({
            client_id: client.id,
            seller_id: sellerId,
            notification_type: notificationType,
            expiration_cycle_date: client.expiration_date,
            sent_via: sentVia,
          });

          totalSent++;
          results.push({
            type: 'client',
            seller: sellerId,
            client: client.name,
            notificationType,
            via: sentVia,
          });
        }

        // Add delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`WhatsApp automation complete. Total sent: ${totalSent} (WhatsApp: ${totalSent - pushSent}, Push: ${pushSent})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: testMode ? 'Test preview complete' : 'Automation complete',
        testMode,
        sent: totalSent,
        whatsappSent: totalSent - pushSent,
        pushSent,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
