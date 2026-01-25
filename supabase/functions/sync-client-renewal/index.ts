import { createClient } from "npm:@supabase/supabase-js@2";
import { format, addDays } from "npm:date-fns@3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Zod schema for renewal request validation
const renewalRequestSchema = z.object({
  seller_id: z.string()
    .uuid("Invalid seller ID format"),
  client_phone: z.string()
    .min(8, "Phone must have at least 8 digits")
    .max(20, "Phone too long")
    .transform(val => val.replace(/\D/g, '')),
  message_content: z.string()
    .max(2000, "Message too long")
    .optional(),
  renewal_days: z.number()
    .int("Must be an integer")
    .min(1, "Minimum 1 day")
    .max(3650, "Maximum 10 years")
    .optional(),
  new_expiration_date: z.string()
    .max(50, "Date too long")
    .optional(),
  source: z.enum(['message_detection', 'webhook'])
    .optional()
    .default('message_detection'),
});

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

    // Parse and validate payload with Zod
    const rawBody = await req.json();
    const validationResult = renewalRequestSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      console.log('[sync-renewal] Validation failed:', errors);
      return new Response(
        JSON.stringify({ success: false, error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { seller_id, client_phone, message_content, renewal_days, new_expiration_date, source } = validationResult.data;

    console.log(`[sync-renewal] Processing renewal for seller ${seller_id}, phone ${client_phone}`);

    // Buscar cliente pelo telefone (already normalized by Zod transform)
    // Incluir campos de integração para validação
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, phone, expiration_date, plan_id, plan_name, plan_price, is_archived, is_integrated, integration_origin')
      .eq('seller_id', seller_id)
      .eq('phone', client_phone)
      .eq('is_archived', false)
      .maybeSingle();

    if (clientError) {
      console.error('[sync-renewal] Client fetch error:', clientError);
      throw clientError;
    }

    if (!client) {
      console.log('[sync-renewal] Client not found with phone:', client_phone);
      
      // Registrar no log
      await supabase.from('server_sync_log').insert({
        seller_id,
        client_phone,
        sync_type: 'renewal',
        source,
        success: false,
        error_message: 'Client not found with this phone number',
      });

      return new Response(
        JSON.stringify({ success: false, error: 'Client not found', client_phone }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================================
    // VALIDAÇÃO DE INTEGRAÇÃO
    // Apenas clientes criados via API (is_integrated = true) participam
    // da sincronização automática. Clientes manuais são ignorados.
    // =====================================================================
    if (!client.is_integrated) {
      console.log(`[sync-renewal] Client ${client.name} (${client.id}) is NOT integrated - skipping sync`);
      console.log(`[sync-renewal] Integration status: is_integrated=${client.is_integrated}, origin=${client.integration_origin}`);
      
      // Registrar no log técnico sem alterar dados
      await supabase.from('server_sync_log').insert({
        seller_id,
        client_id: client.id,
        client_phone,
        sync_type: 'renewal',
        source,
        success: false,
        error_message: 'Client is not integrated (manual client) - sync skipped',
        server_response: {
          is_integrated: client.is_integrated,
          integration_origin: client.integration_origin,
          message_content: message_content?.substring(0, 200),
        },
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Client not integrated',
          reason: 'manual_client',
          client_id: client.id,
          client_name: client.name,
          is_integrated: false,
          sync_skipped: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-renewal] Client ${client.name} is integrated (origin: ${client.integration_origin}) - proceeding with sync`);

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
            .maybeSingle();
          
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
          .maybeSingle();
        
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
      client_phone,
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