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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { backup, mode } = await req.json();

    // Standardized logging
    const timestamp = new Date().toISOString();
    console.log(`[restore-data] timestamp=${timestamp} seller_id=${user.id} action=restore_start status=processing mode=${mode}`);
    console.log(`[restore-data] backup_version=${backup?.version}, type=${backup?.exportType || 'standard'}`);
    
    if (!backup || !backup.data) {
      return new Response(
        JSON.stringify({ error: 'Invalid backup format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      success: true,
      restored: {} as Record<string, number>,
      errors: [] as string[],
      skipped: {} as Record<string, number>
    };

    // Detect if this is a deploy backup (from another project)
    const isDeployBackup = backup.version?.includes('deploy') || backup.exportType === 'full-deploy';
    console.log(`Is deploy backup: ${isDeployBackup}`);

    // Helper to clean and prepare item for insertion
    function prepareItem(item: any, tableName: string, idMapping: Map<string, string>) {
      const oldId = item.id;
      const newItem = { ...item };
      
      // Always replace seller_id with current user's ID (critical for cross-project restore)
      newItem.seller_id = user!.id;
      
      // Remove id to let DB generate new one
      delete newItem.id;
      
      // Remove timestamps that should be regenerated
      delete newItem.created_at;
      delete newItem.updated_at;
      
      // Handle foreign key references
      if (tableName === 'clients') {
        if (item.plan_id && idMapping.has(item.plan_id)) {
          newItem.plan_id = idMapping.get(item.plan_id);
        } else if (item.plan_id) {
          // Plan doesn't exist in new project, set to null
          newItem.plan_id = null;
        }
        if (item.server_id && idMapping.has(item.server_id)) {
          newItem.server_id = idMapping.get(item.server_id);
        } else if (item.server_id) {
          newItem.server_id = null;
        }
        if (item.server_id_2 && idMapping.has(item.server_id_2)) {
          newItem.server_id_2 = idMapping.get(item.server_id_2);
        } else if (item.server_id_2) {
          newItem.server_id_2 = null;
        }
      }
      
      if (tableName === 'panel_clients') {
        if (item.panel_id && idMapping.has(item.panel_id)) {
          newItem.panel_id = idMapping.get(item.panel_id);
        } else {
          return null; // Skip if panel doesn't exist
        }
        if (item.client_id && idMapping.has(item.client_id)) {
          newItem.client_id = idMapping.get(item.client_id);
        } else {
          return null; // Skip if client doesn't exist
        }
      }
      
      if (tableName === 'referrals') {
        if (item.referrer_client_id && idMapping.has(item.referrer_client_id)) {
          newItem.referrer_client_id = idMapping.get(item.referrer_client_id);
        } else {
          return null;
        }
        if (item.referred_client_id && idMapping.has(item.referred_client_id)) {
          newItem.referred_client_id = idMapping.get(item.referred_client_id);
        } else {
          return null;
        }
      }
      
      if (tableName === 'message_history') {
        if (item.client_id && idMapping.has(item.client_id)) {
          newItem.client_id = idMapping.get(item.client_id);
        } else {
          return null;
        }
        if (item.template_id && idMapping.has(item.template_id)) {
          newItem.template_id = idMapping.get(item.template_id);
        } else {
          newItem.template_id = null;
        }
      }

      if (tableName === 'client_external_apps') {
        if (item.client_id && idMapping.has(item.client_id)) {
          newItem.client_id = idMapping.get(item.client_id);
        } else {
          return null;
        }
        if (item.external_app_id && idMapping.has(item.external_app_id)) {
          newItem.external_app_id = idMapping.get(item.external_app_id);
        } else {
          return null;
        }
      }

      if (tableName === 'client_premium_accounts') {
        if (item.client_id && idMapping.has(item.client_id)) {
          newItem.client_id = idMapping.get(item.client_id);
        } else {
          return null;
        }
      }

      if (tableName === 'server_apps') {
        if (item.server_id && idMapping.has(item.server_id)) {
          newItem.server_id = idMapping.get(item.server_id);
        } else {
          return null;
        }
      }
      
      return { oldId, newItem };
    }

    // Helper to restore a table
    async function restoreTable(tableName: string, data: any[], idMapping: Map<string, string>) {
      if (!data || data.length === 0) return 0;
      
      let count = 0;
      let skipped = 0;
      
      for (const item of data) {
        const prepared = prepareItem(item, tableName, idMapping);
        
        if (!prepared) {
          skipped++;
          continue;
        }
        
        const { oldId, newItem } = prepared;

        const { data: inserted, error } = await supabase
          .from(tableName)
          .insert(newItem)
          .select('id')
          .single();
        
        if (error) {
          console.error(`Error restoring ${tableName}:`, error.message);
          results.errors.push(`${tableName}: ${error.message}`);
        } else {
          idMapping.set(oldId, inserted.id);
          count++;
        }
      }
      
      if (skipped > 0) {
        results.skipped[tableName] = skipped;
      }
      
      return count;
    }

    // If mode is 'replace', delete existing data first
    if (mode === 'replace') {
      console.log('Deleting existing data...');
      // Delete dependent tables first (order matters for foreign keys)
      await supabase.from('client_notification_tracking').delete().eq('seller_id', user.id);
      await supabase.from('client_external_apps').delete().eq('seller_id', user.id);
      await supabase.from('client_premium_accounts').delete().eq('seller_id', user.id);
      await supabase.from('server_apps').delete().eq('seller_id', user.id);
      await supabase.from('panel_clients').delete().eq('seller_id', user.id);
      await supabase.from('message_history').delete().eq('seller_id', user.id);
      await supabase.from('referrals').delete().eq('seller_id', user.id);
      
      await supabase.from('clients').delete().eq('seller_id', user.id);
      
      await Promise.all([
        supabase.from('plans').delete().eq('seller_id', user.id),
        supabase.from('servers').delete().eq('seller_id', user.id),
        supabase.from('coupons').delete().eq('seller_id', user.id),
        supabase.from('whatsapp_templates').delete().eq('seller_id', user.id),
        supabase.from('bills_to_pay').delete().eq('seller_id', user.id),
        supabase.from('shared_panels').delete().eq('seller_id', user.id),
        supabase.from('client_categories').delete().eq('seller_id', user.id),
        supabase.from('external_apps').delete().eq('seller_id', user.id),
      ]);
      
      console.log('Existing data deleted');
    }

    const idMapping = new Map<string, string>();

    // Restore in order to handle foreign keys correctly
    // Level 1: No dependencies
    console.log('Restoring level 1 (no dependencies)...');
    results.restored.plans = await restoreTable('plans', backup.data.plans, idMapping);
    results.restored.servers = await restoreTable('servers', backup.data.servers, idMapping);
    results.restored.shared_panels = await restoreTable('shared_panels', backup.data.shared_panels, idMapping);
    results.restored.whatsapp_templates = await restoreTable('whatsapp_templates', backup.data.whatsapp_templates, idMapping);
    results.restored.client_categories = await restoreTable('client_categories', backup.data.client_categories, idMapping);
    results.restored.external_apps = await restoreTable('external_apps', backup.data.external_apps, idMapping);
    results.restored.coupons = await restoreTable('coupons', backup.data.coupons, idMapping);
    results.restored.bills_to_pay = await restoreTable('bills_to_pay', backup.data.bills_to_pay, idMapping);
    
    // Level 2: Depends on servers
    console.log('Restoring level 2 (depends on servers)...');
    results.restored.server_apps = await restoreTable('server_apps', backup.data.server_apps, idMapping);
    
    // Level 3: Clients (depends on plans/servers)
    console.log('Restoring level 3 (clients)...');
    results.restored.clients = await restoreTable('clients', backup.data.clients, idMapping);
    
    // Level 4: Tables that depend on clients
    console.log('Restoring level 4 (depends on clients)...');
    results.restored.panel_clients = await restoreTable('panel_clients', backup.data.panel_clients, idMapping);
    results.restored.referrals = await restoreTable('referrals', backup.data.referrals, idMapping);
    results.restored.message_history = await restoreTable('message_history', backup.data.message_history, idMapping);
    results.restored.client_external_apps = await restoreTable('client_external_apps', backup.data.client_external_apps, idMapping);
    results.restored.client_premium_accounts = await restoreTable('client_premium_accounts', backup.data.client_premium_accounts, idMapping);

    // Clean up zero counts
    for (const key of Object.keys(results.restored)) {
      if (results.restored[key] === 0) {
        delete results.restored[key];
      }
    }

    console.log(`[restore-data] timestamp=${new Date().toISOString()} seller_id=${user.id} action=restore_complete status=success details=${JSON.stringify(results.restored)}`);
    if (Object.keys(results.skipped).length > 0) {
      console.log(`[restore-data] skipped_items=${JSON.stringify(results.skipped)}`);
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[restore-data] timestamp=${new Date().toISOString()} action=restore_error status=failed error=${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
