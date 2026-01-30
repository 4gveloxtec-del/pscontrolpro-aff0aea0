import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_TIMEOUT_MS = 15000;

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

interface BillingReminder {
  id: string;
  seller_id: string;
  client_id: string;
  template_id: string | null;
  message: string;
  scheduled_date: string;
  scheduled_time: string;
  reminder_type: string;
  status: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  expiration_date: string;
  plan_name: string | null;
  plan_price: number | null;
  billing_mode: string | null;
}

interface SellerProfile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  pix_key: string | null;
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
  if (!dateStr) return '';
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Format price
function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '';
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

// Send message via Evolution API
async function sendEvolutionMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  message: string
): Promise<boolean> {
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

    console.log(`Message sent to ${formattedPhone}: ${response.ok}`);
    return response.ok;
  } catch (error) {
    console.error('Error sending Evolution message:', error);
    return false;
  }
}

// Send push notification to seller (for manual mode)
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
        tag: `billing-reminder-${data.clientId || 'unknown'}`,
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current date and time in São Paulo timezone
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = spTime.toISOString().split('T')[0];
    const currentHour = spTime.getHours();
    const currentMinute = spTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    console.log(`[process-billing-reminders] Running at ${todayStr} ${currentTimeStr}`);

    // Get scheduled reminders for today that should be sent now (time <= current time)
    const { data: pendingReminders, error: remindersError } = await supabase
      .from('billing_reminders')
      .select(`
        *,
        clients:client_id (id, name, phone, expiration_date, plan_name, plan_price, billing_mode)
      `)
      .eq('scheduled_date', todayStr)
      .eq('status', 'scheduled')
      .lte('scheduled_time', currentTimeStr + ':59');

    if (remindersError) {
      throw new Error(`Error fetching reminders: ${remindersError.message}`);
    }

    console.log(`[process-billing-reminders] Found ${pendingReminders?.length || 0} pending reminders`);

    if (!pendingReminders || pendingReminders.length === 0) {
      return new Response(JSON.stringify({
        message: 'No pending reminders to process',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get global WhatsApp config
    const { data: globalConfigData } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .maybeSingle();

    const globalConfig: GlobalConfig | null = globalConfigData?.is_active ? globalConfigData as GlobalConfig : null;

    // Get all unique seller IDs
    const sellerIds = [...new Set(pendingReminders.map(r => r.seller_id))];

    // Get seller profiles
    const { data: sellerProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, company_name, pix_key')
      .in('id', sellerIds);

    const profilesMap = new Map<string, SellerProfile>();
    for (const p of sellerProfiles || []) {
      profilesMap.set(p.id, p);
    }

    // Get seller instances
    const { data: sellerInstances } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .in('seller_id', sellerIds)
      .eq('is_connected', true)
      .eq('instance_blocked', false);

    const instancesMap = new Map<string, SellerInstance>();
    for (const i of sellerInstances || []) {
      instancesMap.set(i.seller_id, i as SellerInstance);
    }

    let processed = 0;
    let whatsappSent = 0;
    let pushSent = 0;
    let failed = 0;

    // Process each reminder
    for (const reminder of pendingReminders) {
      const client = reminder.clients as Client | null;
      
      if (!client) {
        console.log(`[process-billing-reminders] Client not found for reminder ${reminder.id}`);
        await supabase
          .from('billing_reminders')
          .update({ status: 'failed', error_message: 'Cliente não encontrado' })
          .eq('id', reminder.id);
        failed++;
        continue;
      }

      const sellerProfile = profilesMap.get(reminder.seller_id);
      const sellerInstance = instancesMap.get(reminder.seller_id);

      // Build variables for template
      const variables: Record<string, string> = {
        nome: client.name,
        plano: client.plan_name || '',
        vencimento: formatDate(client.expiration_date),
        valor: formatPrice(client.plan_price),
        pix: sellerProfile?.pix_key || '',
        empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
      };

      // Replace variables in message
      const finalMessage = replaceVariables(reminder.message, variables);

      let sent = false;
      let errorMessage: string | null = null;

      // Check billing mode
      const billingMode = client.billing_mode || 'manual';

      if (billingMode === 'automatic') {
        // AUTOMATIC MODE: Send WhatsApp message to client
        if (!client.phone) {
          errorMessage = 'Cliente sem telefone cadastrado';
        } else if (globalConfig && sellerInstance) {
          sent = await sendEvolutionMessage(
            globalConfig,
            sellerInstance.instance_name,
            client.phone,
            finalMessage
          );
          if (sent) whatsappSent++;
          else errorMessage = 'Falha ao enviar via WhatsApp API';
        } else {
          errorMessage = globalConfig 
            ? 'Instância do vendedor não conectada' 
            : 'WhatsApp API não configurada';
        }
      } else {
        // MANUAL MODE: Send push notification to seller (NOT to client)
        const reminderTypeLabel = reminder.reminder_type === 'd1' ? 'Vence Amanhã' : 'Vence Hoje';
        
        sent = await sendPushNotification(
          supabaseUrl,
          supabaseKey,
          reminder.seller_id,
          `📢 Cobrança: ${client.name}`,
          `${reminderTypeLabel} • ${client.plan_name || 'Plano'} • ${formatPrice(client.plan_price)}`,
          {
            type: 'billing-reminder',
            clientId: client.id,
            clientName: client.name,
            clientPhone: client.phone,
            reminderType: reminder.reminder_type,
          }
        );
        
        if (sent) pushSent++;
        else errorMessage = 'Falha ao enviar notificação push';
      }

      // Update reminder status
      await supabase
        .from('billing_reminders')
        .update({
          status: sent ? 'sent' : 'failed',
          sent_at: sent ? new Date().toISOString() : null,
          error_message: errorMessage,
        })
        .eq('id', reminder.id);

      processed++;
      if (!sent) failed++;

      // Small delay between messages
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[process-billing-reminders] Completed: ${processed} processed, ${whatsappSent} WhatsApp, ${pushSent} Push, ${failed} failed`);

    return new Response(JSON.stringify({
      message: 'Reminders processed',
      processed,
      whatsappSent,
      pushSent,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[process-billing-reminders] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
