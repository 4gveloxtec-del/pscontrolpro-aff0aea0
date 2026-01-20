import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GlobalConfig {
  api_url: string;
  api_token: string;
  is_active: boolean;
}

// AES-256-GCM decryption - same logic as crypto Edge Function
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');

async function getDecryptionKey(): Promise<CryptoKey> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptValue(ciphertext: string): Promise<string> {
  try {
    if (!ENCRYPTION_KEY || !ciphertext) {
      return ciphertext || '';
    }
    
    // Check if the data looks like base64-encoded encrypted data
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(ciphertext) || ciphertext.length < 20) {
      // Data doesn't look encrypted, return as-is
      return ciphertext;
    }
    
    const key = await getDecryptionKey();
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    
    // Validate minimum length (12 bytes IV + at least some encrypted data)
    if (combined.length < 13) {
      return ciphertext;
    }
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.log('[decrypt] Failed to decrypt, returning original value:', error);
    // If decryption fails, the data might not be encrypted - return original
    return ciphertext;
  }
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
    
    const response = await fetch(url, {
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

    console.log(`Welcome message sent to ${formattedPhone}: ${response.ok}`);
    return response.ok;
  } catch (error) {
    console.error('Error sending welcome message:', error);
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { clientId, sellerId } = await req.json();

    if (!clientId || !sellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing clientId or sellerId' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-welcome-message] Processing welcome message for client ${clientId}`);

    // Get global config
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .maybeSingle();

    if (!globalConfig || !globalConfig.is_active) {
      console.log('[send-welcome-message] WhatsApp API is inactive');
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp API inactive' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get seller instance
    const { data: sellerInstance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_connected', true)
      .eq('instance_blocked', false)
      .maybeSingle();

    if (!sellerInstance) {
      console.log('[send-welcome-message] Seller has no connected instance');
      return new Response(
        JSON.stringify({ success: false, error: 'No connected instance' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client data
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (!client || !client.phone) {
      console.log('[send-welcome-message] Client not found or has no phone');
      return new Response(
        JSON.stringify({ success: false, error: 'Client not found or no phone' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL: Decrypt login and password in backend before sending
    console.log('[send-welcome-message] Decrypting credentials...');
    const [decryptedLogin, decryptedPassword] = await Promise.all([
      decryptValue(client.login || ''),
      decryptValue(client.password || '')
    ]);
    console.log('[send-welcome-message] Credentials decrypted successfully');

    // Get seller profile
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sellerId)
      .single();

    // Get welcome template
    const categoryLower = (client.category || 'iptv').toLowerCase();
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('type', 'welcome');

    const template = templates?.find(t => t.name.toLowerCase().includes(categoryLower)) 
      || templates?.[0];

    if (!template) {
      console.log('[send-welcome-message] No welcome template found');
      return new Response(
        JSON.stringify({ success: false, error: 'No welcome template' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect ALL MACs from different sources
    const allMacs: string[] = [];
    
    // 1. Check gerencia_app_mac (main gerencia app MAC)
    if (client.gerencia_app_mac && client.gerencia_app_mac.trim()) {
      allMacs.push(client.gerencia_app_mac.trim());
    }
    
    // 2. Check gerencia_app_devices array (multiple device MACs)
    if (client.gerencia_app_devices && Array.isArray(client.gerencia_app_devices)) {
      client.gerencia_app_devices.forEach((device: { mac?: string; name?: string }) => {
        if (device && device.mac && device.mac.trim()) {
          const macValue = device.mac.trim();
          // Avoid duplicates
          if (!allMacs.includes(macValue)) {
            allMacs.push(macValue);
          }
        }
      });
    }

    // 3. Check client_external_apps for MACs (paid apps)
    const { data: clientExternalApps } = await supabase
      .from('client_external_apps')
      .select('devices')
      .eq('client_id', clientId);
    
    if (clientExternalApps) {
      clientExternalApps.forEach((app: { devices?: any }) => {
        if (app.devices && Array.isArray(app.devices)) {
          app.devices.forEach((device: { mac?: string }) => {
            if (device && device.mac && device.mac.trim()) {
              const macValue = device.mac.trim();
              if (!allMacs.includes(macValue)) {
                allMacs.push(macValue);
              }
            }
          });
        }
      });
    }

    // 4. Check client_device_apps for app-related MACs
    const { data: clientDeviceApps } = await supabase
      .from('client_device_apps')
      .select('app_id, reseller_device_apps(name)')
      .eq('client_id', clientId);

    // Format MAC list - only if there are MACs
    let macsList = '';
    if (allMacs.length > 0) {
      macsList = allMacs.map(mac => `• ${mac}`).join('\n');
    }

    // Get device apps for client
    const { data: deviceApps } = await supabase
      .from('reseller_device_apps')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_active', true);

    // Format apps for message
    let appsText = '';
    let linksText = '';
    if (deviceApps && deviceApps.length > 0 && client.device) {
      const clientDevices = (client.device || '').split(',').map((d: string) => d.trim());
      const deviceMapping: Record<string, string[]> = {
        'Smart TV': ['smart_tv'],
        'TV Android': ['android_tv', 'smart_tv'],
        'Celular': ['celular_android', 'iphone'],
        'TV Box': ['android_tv'],
        'Fire Stick': ['fire_stick', 'android_tv'],
      };
      
      const targetTypes = new Set<string>();
      clientDevices.forEach((d: string) => {
        (deviceMapping[d] || []).forEach((t: string) => targetTypes.add(t));
      });

      const compatibleApps = deviceApps.filter((app: any) => 
        (app.device_types || []).some((t: string) => targetTypes.has(t))
      );

      if (compatibleApps.length > 0) {
        appsText = compatibleApps.map((a: any) => `${a.icon || '📱'} ${a.name}`).join('\n');
        linksText = compatibleApps
          .filter((a: any) => a.download_url)
          .map((a: any) => `${a.icon || '📱'} ${a.name}: ${a.download_url}`)
          .join('\n');
      }
    }

    // Replace variables in message - using DECRYPTED values
    // MAC section only appears if there are MACs
    const macSection = allMacs.length > 0 ? `📱 *MAC(s) cadastrado(s):*\n${macsList}` : '';
    
    const message = replaceVariables(template.message, {
      nome: client.name,
      empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
      login: decryptedLogin,
      senha: decryptedPassword,
      login_plain: decryptedLogin,
      senha_plain: decryptedPassword,
      vencimento: formatDate(client.expiration_date),
      valor: String(client.plan_price || 0),
      plano: client.plan_name || '',
      servidor: client.server_name || '',
      pix: sellerProfile?.pix_key || '',
      servico: client.category || 'IPTV',
      mac: macSection,
      macs: macSection,
      // New dynamic filters
      dispositivo: client.device || '',
      apps: appsText,
      links: linksText,
    });

    // Send welcome message
    const sent = await sendEvolutionMessage(
      globalConfig as GlobalConfig,
      sellerInstance.instance_name,
      client.phone,
      message
    );

    if (sent) {
      // Log to message history
      await supabase.from('message_history').insert({
        client_id: clientId,
        seller_id: sellerId,
        phone: client.phone,
        message_content: message,
        message_type: 'welcome',
        template_id: template.id,
      });

      console.log(`[send-welcome-message] Welcome message sent to ${client.name}`);
    }

    return new Response(
      JSON.stringify({ success: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[send-welcome-message] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
