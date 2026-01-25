import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Debug function to check real instance status vs database status
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

    console.log(`[debug-instance-status] Checking seller: ${sellerName}`);

    // 1. Find the seller
    const { data: sellers, error: sellerError } = await supabase
      .from('profiles')
      .select('id, full_name, company_name, whatsapp')
      .or(`full_name.ilike.%${sellerName}%,company_name.ilike.%${sellerName}%`);

    if (sellerError || !sellers?.length) {
      throw new Error(`Seller not found: ${sellerError?.message || 'No results'}`);
    }

    const seller = sellers[0];

    // 2. Get ALL instances for this seller (not just connected)
    const { data: instances, error: instanceError } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', seller.id);

    if (instanceError) {
      console.error('[debug-instance-status] Instance query error:', instanceError);
    }

    // 3. Get global config
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('base_url, api_key')
      .eq('is_active', true)
      .maybeSingle();

    // 4. If we have instances and global config, check real status on Evolution API
    interface InstanceCheck {
      instance_name: string;
      database_status: string;
      database_is_connected: boolean;
      database_last_updated?: string;
      api_response_status?: number;
      api_state?: string;
      api_raw?: unknown;
      status_mismatch?: boolean;
      fixed?: boolean;
      api_error?: string;
    }
    
    const instanceChecks: InstanceCheck[] = [];
    
    if (instances && instances.length > 0 && globalConfig?.base_url && globalConfig?.api_key) {
      for (const instance of instances) {
        try {
          const checkUrl = `${globalConfig.base_url}/instance/connectionState/${instance.instance_name}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(checkUrl, {
            method: 'GET',
            headers: {
              'apikey': globalConfig.api_key,
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          const apiResult = await response.json();
          const apiState = apiResult?.instance?.state || apiResult?.state || 'unknown';
          const hasMismatch = (instance.status === 'connected' || instance.is_connected) && 
                              (apiState !== 'open' && apiState !== 'connected');
          
          const checkEntry: InstanceCheck = {
            instance_name: instance.instance_name,
            database_status: instance.status,
            database_is_connected: instance.is_connected,
            database_last_updated: instance.updated_at,
            api_response_status: response.status,
            api_state: apiState,
            api_raw: apiResult,
            status_mismatch: hasMismatch,
          };
          
          // If there's a mismatch, update the database
          if (hasMismatch) {
            console.log(`[debug-instance-status] MISMATCH DETECTED for ${instance.instance_name}! DB says connected but API says ${apiState}`);
            
            // Update database to reflect real status
            await supabase
              .from('whatsapp_seller_instances')
              .update({ 
                status: 'disconnected', 
                is_connected: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', instance.id);
              
            checkEntry.fixed = true;
          }
          
          instanceChecks.push(checkEntry);
          
        } catch (apiError) {
          instanceChecks.push({
            instance_name: instance.instance_name,
            database_status: instance.status,
            database_is_connected: instance.is_connected,
            api_error: apiError instanceof Error ? apiError.message : String(apiError),
          });
        }
      }
    }

    // 5. Check automation settings
    const { data: automationSettings } = await supabase
      .from('whatsapp_automation_settings')
      .select('*')
      .eq('seller_id', seller.id)
      .maybeSingle();

    const result = {
      seller: {
        id: seller.id,
        name: seller.full_name,
        company: seller.company_name,
      },
      global_api_configured: !!globalConfig,
      instances_in_database: instances?.length || 0,
      instances_details: instances?.map(i => ({
        id: i.id,
        name: i.instance_name,
        status: i.status,
        is_connected: i.is_connected,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })) || [],
      api_checks: instanceChecks,
      automation_settings: automationSettings ? {
        is_enabled: automationSettings.is_enabled,
        updated_at: automationSettings.updated_at,
      } : null,
      diagnosis: [] as string[],
    };

    // Generate diagnosis
    if (!globalConfig) {
      result.diagnosis.push('❌ API Global não configurada pelo admin');
    }
    
    if (!instances || instances.length === 0) {
      result.diagnosis.push('❌ Nenhuma instância cadastrada para este revendedor');
    }
    
    const mismatches = instanceChecks.filter(c => c.status_mismatch);
    if (mismatches.length > 0) {
      result.diagnosis.push(`⚠️ ${mismatches.length} instância(s) com status desatualizado no banco - CORRIGIDO AGORA`);
    }
    
    const apiErrors = instanceChecks.filter(c => c.api_error);
    if (apiErrors.length > 0) {
      result.diagnosis.push(`⚠️ ${apiErrors.length} instância(s) com erro ao verificar na API`);
    }
    
    const reallyConnected = instanceChecks.filter(c => 
      c.api_state === 'open' || c.api_state === 'connected'
    );
    if (reallyConnected.length > 0) {
      result.diagnosis.push(`✅ ${reallyConnected.length} instância(s) realmente conectada(s) na API`);
    } else if (instances && instances.length > 0) {
      result.diagnosis.push('❌ Nenhuma instância está realmente conectada na Evolution API');
    }
    
    if (!automationSettings?.is_enabled) {
      result.diagnosis.push('⚠️ Automação WhatsApp está desativada');
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[debug-instance-status] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
