import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get ASAAS config from app_settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('app_settings')
      .select('key, value')
      .in('key', ['asaas_api_key', 'asaas_environment']);

    if (settingsError) throw settingsError;

    const config: Record<string, string> = {};
    settings?.forEach(s => { config[s.key] = s.value; });

    const apiKey = config.asaas_api_key;
    const environment = config.asaas_environment || 'sandbox';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    // Test connection by getting account info
    const response = await fetch(`${baseUrl}/myAccount`, {
      method: 'GET',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorData.errors?.[0]?.description || 'Falha na autenticação' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountData = await response.json();

    return new Response(
      JSON.stringify({ 
        success: true, 
        account: {
          name: accountData.name,
          email: accountData.email,
          walletBalance: accountData.walletBalance
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error testing ASAAS connection:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
