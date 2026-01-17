import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

interface WhatsAppConfig {
  user_id: string;
  api_url: string;
  api_token: string;
  instance_name: string;
}

// Send message via Evolution API
async function sendEvolutionMessage(
  config: WhatsAppConfig,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
      formattedPhone = '55' + formattedPhone;
    }

    const url = `${config.api_url}/message/sendText/${config.instance_name}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error sending message:', error);
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for config and options
    const body = await req.json().catch(() => ({}));
    const { config: manualConfig, sellerId, skipTracking } = body;

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

    console.log('Running WhatsApp automation check...');
    console.log(`Today: ${todayStr}, +3 days: ${in3DaysStr}, +30 days: ${in30DaysStr}`);

    let totalSent = 0;
    const results: any[] = [];
    const clientsToNotify: any[] = [];

    // If manual config provided, use that
    if (manualConfig && sellerId) {
      console.log(`Processing manual automation for seller ${sellerId}`);
      
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

      for (const client of clients || []) {
        if (!client.phone) continue;

        const daysLeft = daysUntil(client.expiration_date);
        const isPaidApp = client.has_paid_apps || client.category === 'Contas Premium';

        // Determine notification type based on days and service type
        let notificationType = '';
        let templateType = '';

        if (daysLeft === 0) {
          notificationType = isPaidApp ? 'app_vencimento' : 'iptv_vencimento';
          templateType = 'expired';
        } else if (daysLeft === 3) {
          notificationType = isPaidApp ? 'app_3_dias' : 'iptv_3_dias';
          templateType = 'expiring_3days';
        } else if (daysLeft === 30 && isPaidApp) {
          notificationType = 'app_30_dias';
          templateType = 'billing';
        } else {
          continue;
        }

        // Find appropriate template
        const categoryLower = (client.category || 'iptv').toLowerCase();
        const template = templates?.find(t => 
          t.type === templateType && t.name.toLowerCase().includes(categoryLower)
        ) || templates?.find(t => t.type === templateType);

        if (!template) {
          console.log(`No template found for ${templateType} ${categoryLower}`);
          continue;
        }

        // Replace variables
        const message = replaceVariables(template.message, {
          nome: client.name,
          empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
          login: client.login || '',
          senha: client.password || '',
          vencimento: formatDate(client.expiration_date),
          dias_restantes: String(daysLeft),
          valor: String(client.plan_price || 0),
          plano: client.plan_name || '',
          servidor: client.server_name || '',
          pix: sellerProfile?.pix_key || '',
          servico: client.category || 'IPTV',
        });

        // Add to list for frontend tracking
        clientsToNotify.push({
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          notificationType,
          templateType,
          message,
          expirationDate: client.expiration_date,
        });

        // Send message
        const sent = await sendEvolutionMessage(manualConfig, client.phone, message);

        if (sent) {
          totalSent++;
          results.push({
            type: 'client',
            seller: sellerId,
            client: client.name,
            clientId: client.id,
            notificationType,
            expirationDate: client.expiration_date,
          });
        }

        // Add delay between messages
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`WhatsApp automation complete. Total sent: ${totalSent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Automation complete',
        sent: totalSent,
        results,
        clientsToNotify,
        dateChecked: todayStr,
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
