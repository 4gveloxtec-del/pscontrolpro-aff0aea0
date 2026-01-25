import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ Validation Schemas ============

const deviceSchema = z.object({
  mac: z.string().max(100),
  model: z.string().max(100).optional(),
});

const externalAppSchema = z.object({
  appId: z.string().max(100),
  email: z.string().max(255).optional(),
  password: z.string().max(500).optional(),
  expirationDate: z.string().max(30).optional(),
  devices: z.array(deviceSchema).max(20).default([]),
});

const premiumAccountSchema = z.object({
  planName: z.string().max(100).optional(),
  email: z.string().max(255).optional(),
  password: z.string().max(500).optional(),
  price: z.string().max(20).optional(),
  expirationDate: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
});

const serverAppConfigSchema = z.object({
  serverId: z.string().uuid(),
  apps: z.array(z.object({
    serverAppId: z.string().uuid(),
    authCode: z.string().max(200).optional(),
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    provider: z.string().max(100).optional(),
  })).max(50),
});

const panelEntrySchema = z.object({
  panel_id: z.string().uuid(),
  slot_type: z.enum(['iptv', 'p2p']),
});

const payloadSchema = z.object({
  clientData: z.record(z.unknown()),
  clientId: z.string().uuid().optional(),
  sellerId: z.string().uuid(),
  externalApps: z.array(externalAppSchema).max(100).optional(),
  premiumAccounts: z.array(premiumAccountSchema).max(50).optional(),
  serverAppsConfig: z.array(serverAppConfigSchema).max(20).optional(),
  panelEntries: z.array(panelEntrySchema).max(50).optional(),
  sendWelcomeMessage: z.boolean().optional(),
  customWelcomeMessage: z.string().max(2000).nullable().optional(),
});

// ============ Transaction Tracker ============

interface TransactionTracker {
  clientId: string | null;
  insertedIds: Map<string, string[]>;
  committed: boolean;
}

function createTracker(): TransactionTracker {
  return {
    clientId: null,
    insertedIds: new Map([
      ['panel_clients', []],
      ['client_external_apps', []],
      ['client_premium_accounts', []],
      ['client_server_app_credentials', []],
    ]),
    committed: false,
  };
}

// ============ Rollback Function ============

async function rollbackTransaction(
  supabase: any,
  tracker: TransactionTracker,
  isNewClient: boolean
): Promise<void> {
  console.log('[AtomicUpsert] Rolling back transaction...');
  
  // Rollback in reverse order (child tables first)
  const rollbackOrder = [
    'client_server_app_credentials',
    'client_premium_accounts',
    'client_external_apps',
    'panel_clients',
  ];

  for (const table of rollbackOrder) {
    const ids = tracker.insertedIds.get(table);
    if (ids && ids.length > 0) {
      console.log(`[Rollback] Deleting ${ids.length} records from ${table}`);
      await supabase.from(table).delete().in('id', ids);
    }
  }

  // If it was a new client, delete the client record
  if (isNewClient && tracker.clientId) {
    console.log(`[Rollback] Deleting client ${tracker.clientId}`);
    await supabase.from('clients').delete().eq('id', tracker.clientId);
  }

  console.log('[AtomicUpsert] Rollback complete');
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse and validate payload
    const rawPayload = await req.json();
    const validation = payloadSchema.safeParse(rawPayload);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Payload inválido', 
          details: validation.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = validation.data;
    const {
      clientData,
      clientId,
      sellerId,
      externalApps = [],
      premiumAccounts = [],
      serverAppsConfig = [],
      panelEntries = [],
      sendWelcomeMessage,
      customWelcomeMessage,
    } = payload;

    const isUpdate = !!clientId;
    const tracker = createTracker();
    
    let finalClientId: string;
    let details = {
      clientSaved: false,
      externalAppsSaved: 0,
      premiumAccountsSaved: 0,
      serverAppCredentialsSaved: 0,
      panelEntriesSaved: 0,
    };

    try {
      // ============ PHASE 1: Client Record ============
      
      if (isUpdate) {
        // Update existing client
        const { error: updateError } = await supabase
          .from('clients')
          .update({ ...clientData, seller_id: sellerId })
          .eq('id', clientId)
          .eq('seller_id', sellerId);

        if (updateError) {
          throw new Error(`Falha ao atualizar cliente: ${updateError.message}`);
        }

        finalClientId = clientId;
        tracker.clientId = clientId;
        details.clientSaved = true;

        // For updates, delete existing related records first
        await Promise.all([
          supabase.from('client_external_apps').delete().eq('client_id', clientId),
          supabase.from('client_premium_accounts').delete().eq('client_id', clientId),
          supabase.from('client_server_app_credentials').delete().eq('client_id', clientId),
        ]);

      } else {
        // Insert new client - AUDIT FIX: Use maybeSingle() instead of single()
        // =====================================================================
        // CLIENTE MANUAL: is_integrated = false
        // Clientes criados via interface NÃO participam da sincronização automática
        // =====================================================================
        const { data: insertedClient, error: insertError } = await supabase
          .from('clients')
          .insert([{ 
            ...clientData, 
            seller_id: sellerId,
            renewed_at: new Date().toISOString(),
            // INTEGRAÇÃO: Cliente manual - não sincroniza automaticamente
            is_integrated: false,
            integration_origin: 'manual',
          }])
          .select('id')
          .maybeSingle();

        if (insertError) {
          throw new Error(`Falha ao criar cliente: ${insertError.message}`);
        }
        if (!insertedClient) {
          throw new Error('Falha ao criar cliente: nenhum dado retornado');
        }

        finalClientId = insertedClient.id;
        tracker.clientId = finalClientId;
        details.clientSaved = true;
      }

      // ============ PHASE 2: Panel Entries ============
      
      if (panelEntries.length > 0 && !isUpdate) {
        const panelData = panelEntries.map(entry => ({
          panel_id: entry.panel_id,
          client_id: finalClientId,
          seller_id: sellerId,
          slot_type: entry.slot_type,
        }));

        const { data: insertedPanels, error: panelError } = await supabase
          .from('panel_clients')
          .insert(panelData)
          .select('id');

        if (panelError) {
          throw new Error(`Falha ao salvar slots: ${panelError.message}`);
        }

        const panelIds = (insertedPanels || []).map((p: { id: string }) => p.id);
        tracker.insertedIds.set('panel_clients', panelIds);
        details.panelEntriesSaved = panelIds.length;
      }

      // ============ PHASE 3: External Apps ============
      
      for (const app of externalApps) {
        if (!app.appId) continue;

        const isFixedApp = app.appId.startsWith('fixed-');
        const fixedAppName = isFixedApp 
          ? app.appId.replace('fixed-', '').toUpperCase().replace(/-/g, ' ') 
          : null;

        const insertData = {
          client_id: finalClientId,
          seller_id: sellerId,
          devices: app.devices.filter(d => d.mac.trim() !== ''),
          email: app.email || null,
          password: app.password || null, // Already encrypted by client
          expiration_date: app.expirationDate || null,
          external_app_id: isFixedApp ? null : app.appId,
          fixed_app_name: fixedAppName,
        };

        // AUDIT FIX: Use maybeSingle() instead of single()
        const { data: insertedApp, error: appError } = await supabase
          .from('client_external_apps')
          .insert([insertData])
          .select('id')
          .maybeSingle();

        if (appError) {
          throw new Error(`Falha ao salvar app externo: ${appError.message}`);
        }
        if (!insertedApp) {
          throw new Error('Falha ao salvar app externo: nenhum dado retornado');
        }

        tracker.insertedIds.get('client_external_apps')?.push(insertedApp.id);
        details.externalAppsSaved++;
      }

      // ============ PHASE 4: Premium Accounts ============
      
      for (const account of premiumAccounts) {
        if (!account.planName && !account.email) continue;

        const insertData = {
          client_id: finalClientId,
          seller_id: sellerId,
          plan_name: account.planName || null,
          email: account.email || null,
          password: account.password || null,
          price: account.price ? parseFloat(account.price) : 0,
          expiration_date: account.expirationDate || null,
          notes: account.notes || null,
        };

        // AUDIT FIX: Use maybeSingle() instead of single()
        const { data: insertedAccount, error: accountError } = await supabase
          .from('client_premium_accounts')
          .insert([insertData])
          .select('id')
          .maybeSingle();

        if (accountError) {
          throw new Error(`Falha ao salvar conta premium: ${accountError.message}`);
        }
        if (!insertedAccount) {
          throw new Error('Falha ao salvar conta premium: nenhum dado retornado');
        }

        tracker.insertedIds.get('client_premium_accounts')?.push(insertedAccount.id);
        details.premiumAccountsSaved++;
      }

      // ============ PHASE 5: Server App Credentials ============
      
      for (const config of serverAppsConfig) {
        for (const app of config.apps) {
          if (!app.serverAppId) continue;

          const insertData = {
            client_id: finalClientId,
            seller_id: sellerId,
            server_id: config.serverId,
            server_app_id: app.serverAppId,
            auth_code: app.authCode || null,
            username: app.username || null,
            password: app.password || null, // Already encrypted by client
            provider: app.provider || null,
          };

          // AUDIT FIX: Use maybeSingle() instead of single()
          const { data: insertedCred, error: credError } = await supabase
            .from('client_server_app_credentials')
            .insert([insertData])
            .select('id')
            .maybeSingle();

          if (credError) {
            throw new Error(`Falha ao salvar credencial: ${credError.message}`);
          }
          if (!insertedCred) {
            throw new Error('Falha ao salvar credencial: nenhum dado retornado');
          }

          tracker.insertedIds.get('client_server_app_credentials')?.push(insertedCred.id);
          details.serverAppCredentialsSaved++;
        }
      }

      // ============ COMMIT ============
      tracker.committed = true;

      // ============ POST-COMMIT: Welcome Message (non-critical) ============
      
      if (sendWelcomeMessage && !isUpdate && finalClientId) {
        // Fire and forget with timeout - don't fail the transaction for welcome message
        const welcomeController = new AbortController();
        const welcomeTimeoutId = setTimeout(() => welcomeController.abort(), 15000);
        
        fetch(`${supabaseUrl}/functions/v1/send-welcome-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            clientId: finalClientId,
            sellerId,
            customMessage: customWelcomeMessage || undefined,
          }),
          signal: welcomeController.signal,
        })
          .catch(e => console.error('Welcome message failed:', e))
          .finally(() => clearTimeout(welcomeTimeoutId));
      }

      console.log('[AtomicUpsert] Transaction committed successfully:', details);

      return new Response(
        JSON.stringify({
          success: true,
          clientId: finalClientId,
          details,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (operationError) {
      // ============ ROLLBACK ============
      console.error('[AtomicUpsert] Operation failed, initiating rollback:', operationError);
      
      if (!tracker.committed) {
        await rollbackTransaction(supabase, tracker, !isUpdate);
      }

      throw operationError;
    }

  } catch (error) {
    console.error('[AtomicUpsert] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        rolledBack: true,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
