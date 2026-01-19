import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Backup data embedded directly (will be replaced with actual data)
const BACKUP_DATA = {
  "version": "3.0-complete-clean",
  "format": "clean-logical-keys",
  "timestamp": "2026-01-19T10:03:51.237Z",
  "description": "Backup Limpo Completo - Sem IDs, com chaves lógicas",
  "exported_by": "sandelrodrig@gmail.com",
  "stats": {
    "profiles": 15,
    "clients": 251,
    "plans": 194,
    "servers": 45,
    "coupons": 0,
    "referrals": 0,
    "whatsapp_templates": 596,
    "bills_to_pay": 1,
    "shared_panels": 0,
    "panel_clients": 0,
    "message_history": 215,
    "client_categories": 1,
    "external_apps": 7,
    "client_external_apps": 9,
    "client_premium_accounts": 2,
    "custom_products": 0,
    "app_settings": 7,
    "monthly_profits": 1,
    "default_server_icons": 9
  },
  "data": {} as any
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();
  const report: any = {
    imported: {} as Record<string, number>,
    skipped: {} as Record<string, number>,
    errors: [] as string[],
    warnings: [] as string[],
    phase: 'starting'
  };

  try {
    // Get backup data from request body
    const body = await req.json();
    const backup = body.backup;

    if (!backup || !backup.data) {
      throw new Error('Backup data is required');
    }

    console.log('[DirectImport] Starting import with stats:', backup.stats);

    const data = backup.data;

    // Phase 1: Build email-to-id maps
    report.phase = 'building_maps';

    // First, get existing profiles to build the map
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('id, email');

    const emailToSellerId: Record<string, string> = {};
    
    // Add existing profiles to map
    if (existingProfiles) {
      for (const p of existingProfiles) {
        emailToSellerId[p.email.toLowerCase()] = p.id;
      }
    }

    console.log('[DirectImport] Existing profiles:', Object.keys(emailToSellerId).length);

    // Insert new profiles (skip existing)
    report.phase = 'profiles';
    report.imported.profiles = 0;
    report.skipped.profiles = 0;

    if (data.profiles && Array.isArray(data.profiles)) {
      for (const profile of data.profiles) {
        const email = profile.email?.toLowerCase();
        if (!email) continue;

        // Check if already exists
        if (emailToSellerId[email]) {
          report.skipped.profiles++;
          continue;
        }

        // Generate new UUID for profile
        const newId = crypto.randomUUID();
        
        const { error } = await supabase.from('profiles').insert({
          id: newId,
          email: profile.email,
          full_name: profile.full_name,
          whatsapp: profile.whatsapp,
          pix_key: profile.pix_key,
          company_name: profile.company_name,
          is_active: profile.is_active ?? true,
          is_permanent: profile.is_permanent ?? false,
          subscription_expires_at: profile.subscription_expires_at,
          tutorial_visto: profile.tutorial_visto ?? false,
          needs_password_update: profile.needs_password_update ?? false,
          notification_days_before: profile.notification_days_before ?? 3,
        });

        if (error) {
          if (error.code === '23505') { // Duplicate
            report.skipped.profiles++;
          } else {
            report.errors.push(`[profiles] ${profile.email}: ${error.message}`);
          }
        } else {
          emailToSellerId[email] = newId;
          report.imported.profiles++;
        }
      }
    }

    console.log('[DirectImport] Profiles imported:', report.imported.profiles);

    // Phase 2: Import servers
    report.phase = 'servers';
    report.imported.servers = 0;
    report.skipped.servers = 0;

    const serverKeyToId: Record<string, string> = {};

    // Get existing servers
    const { data: existingServers } = await supabase.from('servers').select('id, name, seller_id');
    if (existingServers) {
      for (const s of existingServers) {
        const sellerId = s.seller_id;
        const key = `${s.name.toLowerCase().trim()}|${sellerId}`;
        serverKeyToId[key] = s.id;
      }
    }

    if (data.servers && Array.isArray(data.servers)) {
      for (const server of data.servers) {
        const sellerEmail = (server._seller_email || server.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];

        if (!sellerId) {
          report.warnings.push(`[servers] ${server.name}: seller ${sellerEmail} not found`);
          continue;
        }

        const key = `${server.name.toLowerCase().trim()}|${sellerId}`;
        if (serverKeyToId[key]) {
          report.skipped.servers++;
          continue;
        }

        const newId = crypto.randomUUID();
        const { error } = await supabase.from('servers').insert({
          id: newId,
          seller_id: sellerId,
          name: server.name,
          notes: server.notes,
          panel_url: server.panel_url,
          icon_url: server.icon_url,
          monthly_cost: server.monthly_cost ?? 0,
          is_active: server.is_active ?? true,
          is_credit_based: server.is_credit_based ?? false,
          credit_value: server.credit_value ?? 0,
          total_credits: server.total_credits ?? 0,
          used_credits: server.used_credits ?? 0,
          iptv_per_credit: server.iptv_per_credit ?? 0,
          p2p_per_credit: server.p2p_per_credit ?? 0,
          credit_price: server.credit_price ?? 0,
          total_screens_per_credit: server.total_screens_per_credit ?? 0,
        });

        if (error) {
          if (error.code === '23505') {
            report.skipped.servers++;
          } else {
            report.errors.push(`[servers] ${server.name}: ${error.message}`);
          }
        } else {
          serverKeyToId[key] = newId;
          report.imported.servers++;
        }
      }
    }

    console.log('[DirectImport] Servers imported:', report.imported.servers);

    // Phase 3: Import plans
    report.phase = 'plans';
    report.imported.plans = 0;
    report.skipped.plans = 0;

    const planKeyToId: Record<string, string> = {};

    // Get existing plans
    const { data: existingPlans } = await supabase.from('plans').select('id, name, seller_id');
    if (existingPlans) {
      for (const p of existingPlans) {
        const key = `${p.name.toLowerCase().trim()}|${p.seller_id}`;
        planKeyToId[key] = p.id;
      }
    }

    if (data.plans && Array.isArray(data.plans)) {
      for (const plan of data.plans) {
        const sellerEmail = (plan._seller_email || plan.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];

        if (!sellerId) {
          report.warnings.push(`[plans] ${plan.name}: seller ${sellerEmail} not found`);
          continue;
        }

        const key = `${plan.name.toLowerCase().trim()}|${sellerId}`;
        if (planKeyToId[key]) {
          report.skipped.plans++;
          continue;
        }

        const newId = crypto.randomUUID();
        const { error } = await supabase.from('plans').insert({
          id: newId,
          seller_id: sellerId,
          name: plan.name,
          description: plan.description,
          price: plan.price ?? 0,
          duration_days: plan.duration_days ?? 30,
          screens: plan.screens ?? 1,
          category: plan.category,
          is_active: plan.is_active ?? true,
        });

        if (error) {
          if (error.code === '23505') {
            report.skipped.plans++;
          } else {
            report.errors.push(`[plans] ${plan.name}: ${error.message}`);
          }
        } else {
          planKeyToId[key] = newId;
          report.imported.plans++;
        }
      }
    }

    console.log('[DirectImport] Plans imported:', report.imported.plans);

    // Phase 4: Import clients
    report.phase = 'clients';
    report.imported.clients = 0;
    report.skipped.clients = 0;

    const clientKeyToId: Record<string, string> = {};

    if (data.clients && Array.isArray(data.clients)) {
      for (const client of data.clients) {
        const sellerEmail = (client._seller_email || client.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];

        if (!sellerId) {
          report.warnings.push(`[clients] ${client.name}: seller ${sellerEmail} not found`);
          continue;
        }

        // Resolve server
        let serverId = null;
        const serverName = client._server_name || client.server_name;
        if (serverName) {
          const serverKey = `${serverName.toLowerCase().trim()}|${sellerId}`;
          serverId = serverKeyToId[serverKey];
        }

        // Resolve server 2
        let serverId2 = null;
        const serverName2 = client._server_name_2 || client.server_name_2;
        if (serverName2) {
          const serverKey2 = `${serverName2.toLowerCase().trim()}|${sellerId}`;
          serverId2 = serverKeyToId[serverKey2];
        }

        // Resolve plan
        let planId = null;
        const planName = client._plan_name || client.plan_name;
        if (planName) {
          const planKey = `${planName.toLowerCase().trim()}|${sellerId}`;
          planId = planKeyToId[planKey];
        }

        const newId = crypto.randomUUID();
        const clientKey = `${client.name?.toLowerCase().trim() || ''}|${client.phone || ''}|${sellerId}`;
        
        const { error } = await supabase.from('clients').insert({
          id: newId,
          seller_id: sellerId,
          server_id: serverId,
          server_id_2: serverId2,
          server_name: serverName,
          server_name_2: serverName2,
          plan_id: planId,
          plan_name: planName,
          name: client.name,
          phone: client.phone,
          email: client.email,
          telegram: client.telegram,
          device: client.device,
          dns: client.dns,
          login: client.login,
          password: client.password,
          login_2: client.login_2,
          password_2: client.password_2,
          plan_price: client.plan_price,
          expiration_date: client.expiration_date,
          is_paid: client.is_paid ?? false,
          pending_amount: client.pending_amount ?? 0,
          expected_payment_date: client.expected_payment_date,
          notes: client.notes,
          category: client.category,
          referral_code: client.referral_code,
          is_archived: client.is_archived ?? false,
          archived_at: client.archived_at,
          renewed_at: client.renewed_at,
          app_type: client.app_type,
          app_name: client.app_name,
          has_paid_apps: client.has_paid_apps ?? false,
          paid_apps_email: client.paid_apps_email,
          paid_apps_password: client.paid_apps_password,
          paid_apps_expiration: client.paid_apps_expiration,
          paid_apps_duration: client.paid_apps_duration,
          premium_password: client.premium_password,
          premium_price: client.premium_price,
          gerencia_app_mac: client.gerencia_app_mac,
          gerencia_app_devices: client.gerencia_app_devices || [],
          credentials_fingerprint: client.credentials_fingerprint,
          additional_servers: client.additional_servers,
        });

        if (error) {
          if (error.code === '23505') {
            report.skipped.clients++;
          } else {
            report.errors.push(`[clients] ${client.name}: ${error.message}`);
          }
        } else {
          clientKeyToId[clientKey] = newId;
          report.imported.clients++;
        }
      }
    }

    console.log('[DirectImport] Clients imported:', report.imported.clients);

    // Phase 5: Import whatsapp_templates
    report.phase = 'whatsapp_templates';
    report.imported.whatsapp_templates = 0;
    report.skipped.whatsapp_templates = 0;

    if (data.whatsapp_templates && Array.isArray(data.whatsapp_templates)) {
      const batches: any[][] = [];
      for (let i = 0; i < data.whatsapp_templates.length; i += 100) {
        batches.push(data.whatsapp_templates.slice(i, i + 100));
      }

      for (const batch of batches) {
        const insertData = batch.map((template: any) => {
          const sellerEmail = (template._seller_email || template.seller_email)?.toLowerCase();
          const sellerId = emailToSellerId[sellerEmail];
          if (!sellerId) return null;

          return {
            id: crypto.randomUUID(),
            seller_id: sellerId,
            name: template.name,
            type: template.type || 'welcome',
            message: template.message || '',
            is_default: template.is_default ?? false,
          };
        }).filter(Boolean);

        if (insertData.length > 0) {
          const { error, data: inserted } = await supabase
            .from('whatsapp_templates')
            .insert(insertData)
            .select('id');

          if (error) {
            // Fallback to individual inserts
            for (const item of insertData) {
              const { error: itemError } = await supabase.from('whatsapp_templates').insert(item);
              if (itemError) {
                if (itemError.code === '23505') {
                  report.skipped.whatsapp_templates++;
                } else {
                  report.errors.push(`[whatsapp_templates] ${(item as any).name}: ${itemError.message}`);
                }
              } else {
                report.imported.whatsapp_templates++;
              }
            }
          } else {
            report.imported.whatsapp_templates += inserted?.length || insertData.length;
          }
        }
      }
    }

    console.log('[DirectImport] Templates imported:', report.imported.whatsapp_templates);

    // Phase 6: Import external_apps
    report.phase = 'external_apps';
    report.imported.external_apps = 0;

    const externalAppKeyToId: Record<string, string> = {};

    if (data.external_apps && Array.isArray(data.external_apps)) {
      for (const app of data.external_apps) {
        const sellerEmail = (app._seller_email || app.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        const newId = crypto.randomUUID();
        const { error } = await supabase.from('external_apps').insert({
          id: newId,
          seller_id: sellerId,
          name: app.name,
          auth_type: app.auth_type || 'email_password',
          cost: app.cost ?? 0,
          price: app.price ?? 0,
          download_url: app.download_url,
          website_url: app.website_url,
          is_active: app.is_active ?? true,
        });

        if (error) {
          if (error.code !== '23505') {
            report.errors.push(`[external_apps] ${app.name}: ${error.message}`);
          }
        } else {
          const key = `${app.name.toLowerCase().trim()}|${sellerId}`;
          externalAppKeyToId[key] = newId;
          report.imported.external_apps++;
        }
      }
    }

    // Phase 7: Import client_external_apps
    report.phase = 'client_external_apps';
    report.imported.client_external_apps = 0;

    if (data.client_external_apps && Array.isArray(data.client_external_apps)) {
      for (const item of data.client_external_apps) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        // Resolve client
        const clientName = item._client_name || item.client_name;
        const clientPhone = item._client_phone || item.client_phone;
        const clientKey = `${clientName?.toLowerCase().trim() || ''}|${clientPhone || ''}|${sellerId}`;
        const clientId = clientKeyToId[clientKey];

        // Resolve external app
        const appName = item._app_name || item.app_name;
        const appKey = `${appName?.toLowerCase().trim() || ''}|${sellerId}`;
        const externalAppId = externalAppKeyToId[appKey];

        if (!clientId || !externalAppId) {
          report.warnings.push(`[client_external_apps] Could not resolve client/app`);
          continue;
        }

        const { error } = await supabase.from('client_external_apps').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          client_id: clientId,
          external_app_id: externalAppId,
          email: item.email,
          password: item.password,
          expiration_date: item.expiration_date,
          devices: item.devices || [],
          notes: item.notes,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[client_external_apps]: ${error.message}`);
        } else if (!error) {
          report.imported.client_external_apps++;
        }
      }
    }

    // Phase 8: Import client_premium_accounts
    report.phase = 'client_premium_accounts';
    report.imported.client_premium_accounts = 0;

    if (data.client_premium_accounts && Array.isArray(data.client_premium_accounts)) {
      for (const item of data.client_premium_accounts) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        // Resolve client
        const clientName = item._client_name || item.client_name;
        const clientPhone = item._client_phone || item.client_phone;
        const clientKey = `${clientName?.toLowerCase().trim() || ''}|${clientPhone || ''}|${sellerId}`;
        const clientId = clientKeyToId[clientKey];

        if (!clientId) {
          report.warnings.push(`[client_premium_accounts] Could not resolve client`);
          continue;
        }

        const { error } = await supabase.from('client_premium_accounts').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          client_id: clientId,
          plan_name: item.plan_name,
          email: item.email,
          password: item.password,
          expiration_date: item.expiration_date,
          price: item.price,
          notes: item.notes,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[client_premium_accounts]: ${error.message}`);
        } else if (!error) {
          report.imported.client_premium_accounts++;
        }
      }
    }

    // Phase 9: Import message_history
    report.phase = 'message_history';
    report.imported.message_history = 0;

    if (data.message_history && Array.isArray(data.message_history)) {
      for (const item of data.message_history) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        // Resolve client
        const clientName = item._client_name || item.client_name;
        const clientPhone = item._client_phone || item.client_phone;
        const clientKey = `${clientName?.toLowerCase().trim() || ''}|${clientPhone || ''}|${sellerId}`;
        const clientId = clientKeyToId[clientKey];

        if (!clientId) continue;

        const { error } = await supabase.from('message_history').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          client_id: clientId,
          phone: item.phone || clientPhone,
          message_type: item.message_type || 'manual',
          message_content: item.message_content || '',
          sent_at: item.sent_at,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[message_history]: ${error.message}`);
        } else if (!error) {
          report.imported.message_history++;
        }
      }
    }

    // Phase 10: Import monthly_profits
    report.phase = 'monthly_profits';
    report.imported.monthly_profits = 0;

    if (data.monthly_profits && Array.isArray(data.monthly_profits)) {
      for (const item of data.monthly_profits) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        const { error } = await supabase.from('monthly_profits').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          year: item.year,
          month: item.month,
          revenue: item.revenue ?? 0,
          server_costs: item.server_costs ?? 0,
          bills_costs: item.bills_costs ?? 0,
          net_profit: item.net_profit ?? 0,
          active_clients: item.active_clients ?? 0,
          closed_at: item.closed_at,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[monthly_profits]: ${error.message}`);
        } else if (!error) {
          report.imported.monthly_profits++;
        }
      }
    }

    // Phase 11: Import bills_to_pay
    report.phase = 'bills_to_pay';
    report.imported.bills_to_pay = 0;

    if (data.bills_to_pay && Array.isArray(data.bills_to_pay)) {
      for (const item of data.bills_to_pay) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        const { error } = await supabase.from('bills_to_pay').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          description: item.description,
          amount: item.amount ?? 0,
          due_date: item.due_date,
          is_paid: item.is_paid ?? false,
          paid_at: item.paid_at,
          recipient_name: item.recipient_name || 'N/A',
          recipient_pix: item.recipient_pix,
          recipient_whatsapp: item.recipient_whatsapp,
          notes: item.notes,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[bills_to_pay]: ${error.message}`);
        } else if (!error) {
          report.imported.bills_to_pay++;
        }
      }
    }

    // Phase 12: Import app_settings
    report.phase = 'app_settings';
    report.imported.app_settings = 0;

    if (data.app_settings && Array.isArray(data.app_settings)) {
      for (const item of data.app_settings) {
        const { error } = await supabase.from('app_settings').upsert({
          id: crypto.randomUUID(),
          key: item.key,
          value: item.value,
          description: item.description,
        }, { onConflict: 'key' });

        if (error && error.code !== '23505') {
          report.errors.push(`[app_settings] ${item.key}: ${error.message}`);
        } else if (!error) {
          report.imported.app_settings++;
        }
      }
    }

    // Phase 13: Import default_server_icons
    report.phase = 'default_server_icons';
    report.imported.default_server_icons = 0;

    if (data.default_server_icons && Array.isArray(data.default_server_icons)) {
      for (const item of data.default_server_icons) {
        const { error } = await supabase.from('default_server_icons').upsert({
          id: crypto.randomUUID(),
          name: item.name,
          name_normalized: item.name_normalized || item.name.toLowerCase().trim(),
          icon_url: item.icon_url,
        }, { onConflict: 'name_normalized' });

        if (error && error.code !== '23505') {
          report.errors.push(`[default_server_icons] ${item.name}: ${error.message}`);
        } else if (!error) {
          report.imported.default_server_icons++;
        }
      }
    }

    // Phase 14: Import client_categories
    report.phase = 'client_categories';
    report.imported.client_categories = 0;

    if (data.client_categories && Array.isArray(data.client_categories)) {
      for (const item of data.client_categories) {
        const sellerEmail = (item._seller_email || item.seller_email)?.toLowerCase();
        const sellerId = emailToSellerId[sellerEmail];
        if (!sellerId) continue;

        const { error } = await supabase.from('client_categories').insert({
          id: crypto.randomUUID(),
          seller_id: sellerId,
          name: item.name,
        });

        if (error && error.code !== '23505') {
          report.errors.push(`[client_categories] ${item.name}: ${error.message}`);
        } else if (!error) {
          report.imported.client_categories++;
        }
      }
    }

    report.phase = 'completed';
    const endTime = Date.now();

    const response = {
      success: true,
      status: report.errors.length > 0 ? 'partial_success' : 'success',
      report,
      duration_ms: endTime - startTime,
      message: `Importação concluída! ${Object.values(report.imported).reduce((a: number, b: any) => a + (b || 0), 0)} registros importados.`
    };

    console.log('[DirectImport] Complete:', JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[DirectImport] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      report
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
