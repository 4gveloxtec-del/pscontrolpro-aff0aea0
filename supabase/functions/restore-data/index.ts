import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TRANSACTION TRACKER - For manual rollback
// ============================================
interface TransactionTracker {
  insertedIds: Map<string, string[]>; // table -> [ids]
  phase: string;
  startTime: number;
  committed: boolean;
}

function createTransactionTracker(): TransactionTracker {
  return {
    insertedIds: new Map(),
    phase: 'init',
    startTime: Date.now(),
    committed: false,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Transaction tracker for manual rollback
  const tx = createTransactionTracker();

  // ============================================
  // ROLLBACK FUNCTION
  // ============================================
  async function rollback(reason: string): Promise<void> {
    console.error(`[restore-data] ROLLBACK triggered: ${reason}`);
    console.log(`[restore-data] Rolling back ${tx.insertedIds.size} tables...`);

    // Rollback in reverse order (respect FK constraints)
    const rollbackOrder = [
      'client_premium_accounts',
      'client_external_apps',
      'message_history',
      'referrals',
      'panel_clients',
      'server_apps',
      'clients',
      'external_apps',
      'client_categories',
      'shared_panels',
      'bills_to_pay',
      'whatsapp_templates',
      'coupons',
      'servers',
      'plans',
    ];

    for (const table of rollbackOrder) {
      const ids = tx.insertedIds.get(table);
      if (ids && ids.length > 0) {
        try {
          console.log(`[rollback] Deleting ${ids.length} records from ${table}...`);
          const { error } = await supabase
            .from(table)
            .delete()
            .in('id', ids);
          
          if (error) {
            console.error(`[rollback] Failed to rollback ${table}: ${error.message}`);
          } else {
            console.log(`[rollback] Successfully rolled back ${table}`);
          }
        } catch (e) {
          console.error(`[rollback] Exception rolling back ${table}:`, e);
        }
      }
    }

    console.log(`[restore-data] Rollback completed in ${Date.now() - tx.startTime}ms`);
  }

  // ============================================
  // TRACK INSERT HELPER
  // ============================================
  function trackInsert(table: string, id: string): void {
    if (!tx.insertedIds.has(table)) {
      tx.insertedIds.set(table, []);
    }
    tx.insertedIds.get(table)!.push(id);
  }

  try {
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
      skipped: {} as Record<string, number>,
      rolledBack: false,
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
          return null;
        }
        if (item.client_id && idMapping.has(item.client_id)) {
          newItem.client_id = idMapping.get(item.client_id);
        } else {
          return null;
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

    // ============================================
    // TRANSACTIONAL RESTORE TABLE
    // ============================================
    async function restoreTableTransactional(
      tableName: string, 
      data: any[], 
      idMapping: Map<string, string>
    ): Promise<{ count: number; error?: string }> {
      if (!data || data.length === 0) return { count: 0 };
      
      tx.phase = tableName;
      let count = 0;
      let skipped = 0;
      let criticalError: string | undefined;
      
      for (const item of data) {
        const prepared = prepareItem(item, tableName, idMapping);
        
        if (!prepared) {
          skipped++;
          continue;
        }
        
        const { oldId, newItem } = prepared;

        try {
          const { data: inserted, error } = await supabase
            .from(tableName)
            .insert(newItem)
            .select('id')
            .single();
          
          if (error) {
            // Check if it's a critical error that should trigger rollback
            if (error.code === '23503' || error.code === '23505') {
              // FK violation or unique constraint - log but continue
              console.warn(`[${tableName}] Constraint violation: ${error.message}`);
              results.errors.push(`${tableName}: ${error.message}`);
            } else if (error.code?.startsWith('42') || error.code?.startsWith('53')) {
              // Schema error or resource limit - critical, trigger rollback
              criticalError = `Critical error in ${tableName}: ${error.message}`;
              break;
            } else {
              results.errors.push(`${tableName}: ${error.message}`);
            }
          } else if (inserted) {
            idMapping.set(oldId, inserted.id);
            trackInsert(tableName, inserted.id);
            count++;
          }
        } catch (e) {
          criticalError = `Exception in ${tableName}: ${e instanceof Error ? e.message : 'Unknown'}`;
          break;
        }
      }
      
      if (skipped > 0) {
        results.skipped[tableName] = skipped;
      }
      
      return { count, error: criticalError };
    }

    // ============================================
    // BEGIN TRANSACTION (conceptual)
    // ============================================
    console.log('[restore-data] BEGIN TRANSACTION');
    tx.phase = 'cleanup';

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

    // ============================================
    // RESTORE IN ORDER (with transaction tracking)
    // ============================================
    
    // Level 1: No dependencies
    console.log('Restoring level 1 (no dependencies)...');
    tx.phase = 'level1';
    
    let result = await restoreTableTransactional('plans', backup.data.plans, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.plans = result.count;

    result = await restoreTableTransactional('servers', backup.data.servers, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.servers = result.count;

    result = await restoreTableTransactional('shared_panels', backup.data.shared_panels, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.shared_panels = result.count;

    result = await restoreTableTransactional('whatsapp_templates', backup.data.whatsapp_templates, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.whatsapp_templates = result.count;

    result = await restoreTableTransactional('client_categories', backup.data.client_categories, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.client_categories = result.count;

    result = await restoreTableTransactional('external_apps', backup.data.external_apps, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.external_apps = result.count;

    result = await restoreTableTransactional('coupons', backup.data.coupons, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.coupons = result.count;

    result = await restoreTableTransactional('bills_to_pay', backup.data.bills_to_pay, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.bills_to_pay = result.count;
    
    // Level 2: Depends on servers
    console.log('Restoring level 2 (depends on servers)...');
    tx.phase = 'level2';
    
    result = await restoreTableTransactional('server_apps', backup.data.server_apps, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.server_apps = result.count;
    
    // Level 3: Clients (depends on plans/servers)
    console.log('Restoring level 3 (clients)...');
    tx.phase = 'level3';
    
    result = await restoreTableTransactional('clients', backup.data.clients, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.clients = result.count;
    
    // Level 4: Tables that depend on clients
    console.log('Restoring level 4 (depends on clients)...');
    tx.phase = 'level4';
    
    result = await restoreTableTransactional('panel_clients', backup.data.panel_clients, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.panel_clients = result.count;

    result = await restoreTableTransactional('referrals', backup.data.referrals, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.referrals = result.count;

    result = await restoreTableTransactional('message_history', backup.data.message_history, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.message_history = result.count;

    result = await restoreTableTransactional('client_external_apps', backup.data.client_external_apps, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.client_external_apps = result.count;

    result = await restoreTableTransactional('client_premium_accounts', backup.data.client_premium_accounts, idMapping);
    if (result.error) { await rollback(result.error); results.rolledBack = true; throw new Error(result.error); }
    results.restored.client_premium_accounts = result.count;

    // ============================================
    // COMMIT TRANSACTION (conceptual)
    // ============================================
    tx.committed = true;
    console.log('[restore-data] COMMIT TRANSACTION');

    // Clean up zero counts
    for (const key of Object.keys(results.restored)) {
      if (results.restored[key] === 0) {
        delete results.restored[key];
      }
    }

    const totalTime = Date.now() - tx.startTime;
    console.log(`[restore-data] timestamp=${new Date().toISOString()} seller_id=${user.id} action=restore_complete status=success duration=${totalTime}ms details=${JSON.stringify(results.restored)}`);
    if (Object.keys(results.skipped).length > 0) {
      console.log(`[restore-data] skipped_items=${JSON.stringify(results.skipped)}`);
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // If transaction wasn't committed, ensure rollback
    if (!tx.committed && tx.insertedIds.size > 0) {
      console.log('[restore-data] Transaction not committed, performing rollback...');
      await rollback(errorMessage);
    }

    console.error(`[restore-data] timestamp=${new Date().toISOString()} action=restore_error status=failed phase=${tx.phase} error=${errorMessage}`);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        phase: tx.phase,
        rolledBack: !tx.committed && tx.insertedIds.size > 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
