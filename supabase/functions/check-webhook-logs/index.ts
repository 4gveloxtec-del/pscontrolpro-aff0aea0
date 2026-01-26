import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { seller_id, minutes = 30 } = await req.json();

    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    // Buscar logs de conexão recentes
    const { data: connectionLogs, error: connError } = await supabase
      .from('connection_logs')
      .select('*')
      .eq('seller_id', seller_id)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(20);

    // Buscar logs de comando recentes
    const { data: commandLogs, error: cmdError } = await supabase
      .from('command_logs')
      .select('*')
      .eq('owner_id', seller_id)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(20);

    // Buscar sessões de bot recentes
    const { data: botSessions, error: botError } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('seller_id', seller_id)
      .gte('updated_at', cutoffTime)
      .order('updated_at', { ascending: false })
      .limit(10);

    // Buscar logs de mensagens do bot engine
    const { data: botLogs, error: botLogsError } = await supabase
      .from('bot_logs')
      .select('*')
      .eq('seller_id', seller_id)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(20);

    const result = {
      period: `Last ${minutes} minutes`,
      cutoff_time: cutoffTime,
      connection_logs: {
        count: connectionLogs?.length || 0,
        recent: connectionLogs?.slice(0, 5) || [],
        error: connError?.message || null,
      },
      command_logs: {
        count: commandLogs?.length || 0,
        recent: commandLogs?.slice(0, 5) || [],
        error: cmdError?.message || null,
      },
      bot_sessions: {
        count: botSessions?.length || 0,
        recent: botSessions?.slice(0, 3) || [],
        error: botError?.message || null,
      },
      bot_logs: {
        count: botLogs?.length || 0,
        recent: botLogs?.slice(0, 10) || [],
        error: botLogsError?.message || null,
      },
      diagnosis: (() => {
        if (!connectionLogs || connectionLogs.length === 0) {
          return "❌ CRÍTICO: Nenhum webhook recebido nos últimos " + minutes + " minutos! Webhook pode não estar configurado ou Evolution API não está enviando eventos.";
        }
        
        const hasMessages = connectionLogs.some(log => log.event_type === 'messages.upsert');
        if (!hasMessages) {
          return "⚠️ Webhooks recebidos mas nenhum 'messages.upsert' (mensagens). Verifique se mensagens estão chegando.";
        }
        
        if (!botSessions || botSessions.length === 0) {
          return "⚠️ Mensagens recebidas mas nenhuma sessão de bot criada. Bot pode não estar interceptando.";
        }
        
        return "✅ Webhooks e sessões detectados. Verificar logs detalhados acima.";
      })(),
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});