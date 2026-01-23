import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format, addDays } from "https://esm.sh/date-fns@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge function para sincronizar renovação de cliente quando detectada via mensagem da API do servidor.
 * 
 * Fluxo:
 * 1. Mensagem de renovação é enviada pelo servidor via WhatsApp
 * 2. connection-heartbeat detecta palavras-chave de renovação
 * 3. Esta função é chamada para renovar o cliente NO APP
 * 4. NÃO envia notificação (a API do servidor já enviou)
 */

interface RenewalRequest {
  seller_id: string;
  client_phone: string;
  message_content?: string;
  renewal_days?: number; // dias para adicionar (default: busca do plano)
  new_expiration_date?: string; // ou data específica
  source?: 'message_detection' | 'webhook';
}

/**
 * Parseia data no formato brasileiro ou ISO
 */
function parseExpirationDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  // Formato: dd/MM/yyyy
  const brMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  // Formato ISO: yyyy-MM-dd
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  return null;
}

/**
 * Extrai data de vencimento da mensagem
 */
function extractExpirationFromMessage(message: string): Date | null {
  // Procurar padrões de data na mensagem
  const patterns = [
    /v[ae]lidade[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /vencimento[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /expira(?:ção)?[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /até[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})/,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const parsed = parseExpirationDate(match[1]);
      if (parsed) return parsed;
    }
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body: RenewalRequest = await req.json();
    const { seller_id, client_phone, message_content, renewal_days, new_expiration_date, source = 'message_detection' } = body;

    console.log(`[sync-renewal] Processing renewal for seller ${seller_id}, phone ${client_phone}`);

    if (!seller_id || !client_phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing seller_id or client_phone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar telefone
    const normalizedPhone = client_phone.replace(/\D/g, '');

    // Buscar cliente pelo telefone
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, phone, expiration_date, plan_id, plan_name, plan_price, is_archived')
      .eq('seller_id', seller_id)
      .eq('phone', normalizedPhone)
      .eq('is_archived', false)
      .maybeSingle();

    if (clientError) {
      console.error('[sync-renewal] Client fetch error:', clientError);
      throw clientError;
    }

    if (!client) {
      console.log('[sync-renewal] Client not found with phone:', normalizedPhone);
      
      // Registrar no log
      await supabase.from('server_sync_log').insert({
        seller_id,
        client_phone: normalizedPhone,
        sync_type: 'renewal',
        source,
        success: false,
        error_message: 'Client not found with this phone number',
      });

      return new Response(
        JSON.stringify({ success: false, error: 'Client not found', client_phone: normalizedPhone }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar nova data de vencimento
    let newExpirationDate: Date;
    
    if (new_expiration_date) {
      // Data específica fornecida
      const parsed = parseExpirationDate(new_expiration_date);
      if (!parsed) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid expiration date format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      newExpirationDate = parsed;
    } else if (message_content) {
      // Tentar extrair data da mensagem
      const extracted = extractExpirationFromMessage(message_content);
      if (extracted) {
        newExpirationDate = extracted;
      } else {
        // Fallback: buscar duração do plano
        let durationDays = renewal_days || 30;
        
        if (client.plan_id) {
          const { data: plan } = await supabase
            .from('plans')
            .select('duration_days')
            .eq('id', client.plan_id)
            .single();
          
          if (plan?.duration_days) {
            durationDays = plan.duration_days;
          }
        }
        
        // Calcular nova data a partir de hoje ou vencimento atual
        const baseDate = client.expiration_date 
          ? new Date(client.expiration_date + 'T12:00:00') 
          : new Date();
        
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        
        // Se vencimento atual é no futuro, adicionar a partir dele
        const startDate = baseDate > today ? baseDate : today;
        newExpirationDate = addDays(startDate, durationDays);
      }
    } else {
      // Sem data específica nem mensagem, usar duração padrão
      let durationDays = renewal_days || 30;
      
      if (client.plan_id) {
        const { data: plan } = await supabase
          .from('plans')
          .select('duration_days')
          .eq('id', client.plan_id)
          .single();
        
        if (plan?.duration_days) {
          durationDays = plan.duration_days;
        }
      }
      
      const baseDate = client.expiration_date 
        ? new Date(client.expiration_date + 'T12:00:00') 
        : new Date();
      
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      
      const startDate = baseDate > today ? baseDate : today;
      newExpirationDate = addDays(startDate, durationDays);
    }

    const formattedExpiration = format(newExpirationDate, 'yyyy-MM-dd');

    // Atualizar cliente
    // IMPORTANTE: renewed_via_api = true para NÃO enviar notificação duplicada
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        expiration_date: formattedExpiration,
        is_paid: true,
        renewed_at: new Date().toISOString(),
        renewed_via_api: true, // Marca que foi renovado via API - não enviar notificação
      })
      .eq('id', client.id);

    if (updateError) {
      console.error('[sync-renewal] Update error:', updateError);
      throw updateError;
    }

    console.log(`[sync-renewal] Client ${client.name} renewed until ${formattedExpiration}`);

    // Registrar no log
    await supabase.from('server_sync_log').insert({
      seller_id,
      client_id: client.id,
      client_phone: normalizedPhone,
      sync_type: 'renewal',
      source,
      server_response: { 
        message_content: message_content?.substring(0, 500),
        new_expiration: formattedExpiration,
      },
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        client_id: client.id,
        client_name: client.name,
        new_expiration_date: formattedExpiration,
        notification_skipped: true, // Confirma que não enviou notificação
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-renewal] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
