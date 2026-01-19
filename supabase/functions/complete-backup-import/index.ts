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
    
    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { backup, mode, modules } = await req.json();
    
    console.log(`Importing complete backup by admin: ${user.email}, mode: ${mode}`);
    
    // Accept multiple backup formats
    const isValidFormat = 
      backup?.type === 'complete_clean_backup' || // New format
      backup?.version === '3.0-complete-clean' || // Legacy format
      (backup?.format === 'clean-logical-keys' && backup?.data); // Alternative legacy format
    
    if (!backup || !isValidFormat) {
      return new Response(
        JSON.stringify({ 
          error: 'Formato de backup inválido. Formatos aceitos: complete_clean_backup, 3.0-complete-clean, ou clean-logical-keys' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      success: true,
      restored: {} as Record<string, number>,
      errors: [] as string[],
      skipped: {} as Record<string, number>,
      warnings: [] as string[],
    };

    // Get current admin user to preserve
    const { data: currentAdminProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // If mode is 'replace', delete ALL existing data except current admin
    if (mode === 'replace') {
      console.log('Cleaning database (preserving admin)...');
      
      // Get all seller IDs (excluding admin)
      const { data: sellerProfiles } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', user.id);
      
      const sellerIds = sellerProfiles?.map((p: any) => p.id) || [];
      
      if (sellerIds.length > 0) {
        // Delete all data for non-admin users in correct order
        console.log(`Deleting data for ${sellerIds.length} sellers...`);
        
        // Level 4: Most dependent tables
        for (const sellerId of sellerIds) {
          await supabase.from('client_notification_tracking').delete().eq('seller_id', sellerId);
          await supabase.from('client_external_apps').delete().eq('seller_id', sellerId);
          await supabase.from('client_premium_accounts').delete().eq('seller_id', sellerId);
          await supabase.from('panel_clients').delete().eq('seller_id', sellerId);
          await supabase.from('message_history').delete().eq('seller_id', sellerId);
          await supabase.from('referrals').delete().eq('seller_id', sellerId);
          await supabase.from('server_apps').delete().eq('seller_id', sellerId);
        }
        
        // Level 3: Clients
        for (const sellerId of sellerIds) {
          await supabase.from('clients').delete().eq('seller_id', sellerId);
        }
        
        // Level 2: Independent tables
        for (const sellerId of sellerIds) {
          await supabase.from('plans').delete().eq('seller_id', sellerId);
          await supabase.from('servers').delete().eq('seller_id', sellerId);
          await supabase.from('coupons').delete().eq('seller_id', sellerId);
          await supabase.from('whatsapp_templates').delete().eq('seller_id', sellerId);
          await supabase.from('bills_to_pay').delete().eq('seller_id', sellerId);
          await supabase.from('shared_panels').delete().eq('seller_id', sellerId);
          await supabase.from('client_categories').delete().eq('seller_id', sellerId);
          await supabase.from('external_apps').delete().eq('seller_id', sellerId);
          await supabase.from('custom_products').delete().eq('seller_id', sellerId);
          await supabase.from('monthly_profits').delete().eq('seller_id', sellerId);
        }
        
        // Delete chatbot data
        for (const sellerId of sellerIds) {
          await supabase.from('chatbot_interactions').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_flow_sessions').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_flow_nodes').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_flows').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_contacts').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_rules').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_settings').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_template_categories').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_templates').delete().eq('seller_id', sellerId);
          await supabase.from('chatbot_send_logs').delete().eq('seller_id', sellerId);
          await supabase.from('whatsapp_seller_instances').delete().eq('seller_id', sellerId);
          await supabase.from('connection_logs').delete().eq('seller_id', sellerId);
          await supabase.from('connection_alerts').delete().eq('seller_id', sellerId);
        }
        
        // Level 1: Profiles and user_roles (except admin)
        for (const sellerId of sellerIds) {
          await supabase.from('user_roles').delete().eq('user_id', sellerId);
          await supabase.from('profiles').delete().eq('id', sellerId);
        }
      }
      
      console.log('Database cleaned');
    }

    // Create mapping objects
    const emailToSellerId = new Map<string, string>();
    const serverNameToId = new Map<string, string>(); // key: seller_email|server_name
    const planNameToId = new Map<string, string>(); // key: seller_email|plan_name
    const clientIdentifierToId = new Map<string, string>(); // key: seller_email|identifier
    const extAppNameToId = new Map<string, string>(); // key: seller_email|app_name
    const templateNameToId = new Map<string, string>(); // key: seller_email|template_name
    const panelNameToId = new Map<string, string>(); // key: seller_email|panel_name

    // Helper to check if module should be imported
    const shouldImport = (moduleName: string) => {
      if (!modules || modules.length === 0) return true;
      return modules.includes(moduleName);
    };

    // Step 1: Create profiles (sellers)
    if (shouldImport('profiles') && backup.data.profiles?.length > 0) {
      console.log('Creating profiles...');
      let count = 0;
      
      for (const profile of backup.data.profiles) {
        // Skip if email already exists
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', profile.email)
          .single();
        
        if (existing) {
          emailToSellerId.set(profile.email, existing.id);
          results.warnings.push(`Profile ${profile.email} already exists, skipping`);
          continue;
        }
        
        // Create auth user first
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: profile.email,
          email_confirm: true,
          password: Math.random().toString(36).slice(-12) + 'A1!', // Temporary password
          user_metadata: {
            full_name: profile.full_name,
            whatsapp: profile.whatsapp,
          }
        });
        
        if (authError) {
          results.errors.push(`Failed to create user ${profile.email}: ${authError.message}`);
          continue;
        }
        
        emailToSellerId.set(profile.email, authUser.user.id);
        
        // Update profile with additional data
        await supabase
          .from('profiles')
          .update({
            company_name: profile.company_name,
            pix_key: profile.pix_key,
            is_active: profile.is_active,
            is_permanent: profile.is_permanent,
            subscription_expires_at: profile.subscription_expires_at,
            notification_days_before: profile.notification_days_before,
          })
          .eq('id', authUser.user.id);
        
        count++;
      }
      
      results.restored.profiles = count;
    }

    // Step 2: Create servers
    if (shouldImport('servers') && backup.data.servers?.length > 0) {
      console.log('Creating servers...');
      let count = 0;
      
      for (const server of backup.data.servers) {
        const sellerId = emailToSellerId.get(server.seller_email);
        if (!sellerId) {
          results.warnings.push(`Server "${server.name}": seller ${server.seller_email} not found`);
          continue;
        }
        
        const { data: inserted, error } = await supabase
          .from('servers')
          .insert({
            seller_id: sellerId,
            name: server.name,
            panel_url: server.panel_url,
            monthly_cost: server.monthly_cost,
            is_credit_based: server.is_credit_based,
            total_credits: server.total_credits,
            used_credits: server.used_credits,
            credit_price: server.credit_price,
            credit_value: server.credit_value,
            iptv_per_credit: server.iptv_per_credit,
            p2p_per_credit: server.p2p_per_credit,
            total_screens_per_credit: server.total_screens_per_credit,
            icon_url: server.icon_url,
            notes: server.notes,
            is_active: server.is_active,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`Server "${server.name}": ${error.message}`);
        } else {
          serverNameToId.set(`${server.seller_email}|${server.name}`, inserted.id);
          count++;
        }
      }
      
      results.restored.servers = count;
    }

    // Step 3: Create plans
    if (shouldImport('plans') && backup.data.plans?.length > 0) {
      console.log('Creating plans...');
      let count = 0;
      
      for (const plan of backup.data.plans) {
        const sellerId = emailToSellerId.get(plan.seller_email);
        if (!sellerId) continue;
        
        const { data: inserted, error } = await supabase
          .from('plans')
          .insert({
            seller_id: sellerId,
            name: plan.name,
            price: plan.price,
            duration_days: plan.duration_days,
            category: plan.category,
            description: plan.description,
            screens: plan.screens,
            is_active: plan.is_active,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`Plan "${plan.name}": ${error.message}`);
        } else {
          planNameToId.set(`${plan.seller_email}|${plan.name}`, inserted.id);
          count++;
        }
      }
      
      results.restored.plans = count;
    }

    // Step 4: Create external apps
    if (shouldImport('external_apps') && backup.data.external_apps?.length > 0) {
      console.log('Creating external apps...');
      let count = 0;
      
      for (const app of backup.data.external_apps) {
        const sellerId = emailToSellerId.get(app.seller_email);
        if (!sellerId) continue;
        
        const { data: inserted, error } = await supabase
          .from('external_apps')
          .insert({
            seller_id: sellerId,
            name: app.name,
            auth_type: app.auth_type,
            price: app.price,
            cost: app.cost,
            website_url: app.website_url,
            download_url: app.download_url,
            is_active: app.is_active,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`External app "${app.name}": ${error.message}`);
        } else {
          extAppNameToId.set(`${app.seller_email}|${app.name}`, inserted.id);
          count++;
        }
      }
      
      results.restored.external_apps = count;
    }

    // Step 5: Create whatsapp templates
    if (shouldImport('whatsapp_templates') && backup.data.whatsapp_templates?.length > 0) {
      console.log('Creating templates...');
      let count = 0;
      
      for (const template of backup.data.whatsapp_templates) {
        const sellerId = emailToSellerId.get(template.seller_email);
        if (!sellerId) continue;
        
        const { data: inserted, error } = await supabase
          .from('whatsapp_templates')
          .insert({
            seller_id: sellerId,
            name: template.name,
            type: template.type,
            message: template.message,
            is_default: template.is_default,
            created_by: sellerId,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`Template "${template.name}": ${error.message}`);
        } else {
          templateNameToId.set(`${template.seller_email}|${template.name}`, inserted.id);
          count++;
        }
      }
      
      results.restored.whatsapp_templates = count;
    }

    // Step 6: Create shared panels
    if (shouldImport('shared_panels') && backup.data.shared_panels?.length > 0) {
      console.log('Creating shared panels...');
      let count = 0;
      
      for (const panel of backup.data.shared_panels) {
        const sellerId = emailToSellerId.get(panel.seller_email);
        if (!sellerId) continue;
        
        const { data: inserted, error } = await supabase
          .from('shared_panels')
          .insert({
            seller_id: sellerId,
            name: panel.name,
            panel_type: panel.panel_type,
            monthly_cost: panel.monthly_cost,
            total_slots: panel.total_slots,
            used_slots: panel.used_slots || 0,
            used_iptv_slots: panel.used_iptv_slots || 0,
            used_p2p_slots: panel.used_p2p_slots || 0,
            url: panel.url,
            login: panel.login,
            password: panel.password,
            expires_at: panel.expires_at,
            iptv_per_credit: panel.iptv_per_credit,
            p2p_per_credit: panel.p2p_per_credit,
            notes: panel.notes,
            is_active: panel.is_active,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`Panel "${panel.name}": ${error.message}`);
        } else {
          panelNameToId.set(`${panel.seller_email}|${panel.name}`, inserted.id);
          count++;
        }
      }
      
      results.restored.shared_panels = count;
    }

    // Step 7: Create other independent tables
    if (shouldImport('client_categories') && backup.data.client_categories?.length > 0) {
      let count = 0;
      for (const cat of backup.data.client_categories) {
        const sellerId = emailToSellerId.get(cat.seller_email);
        if (!sellerId) continue;
        
        const { error } = await supabase
          .from('client_categories')
          .insert({ seller_id: sellerId, name: cat.name });
        
        if (!error) count++;
      }
      results.restored.client_categories = count;
    }

    if (shouldImport('coupons') && backup.data.coupons?.length > 0) {
      let count = 0;
      for (const coupon of backup.data.coupons) {
        const sellerId = emailToSellerId.get(coupon.seller_email);
        if (!sellerId) continue;
        
        const { error } = await supabase
          .from('coupons')
          .insert({
            seller_id: sellerId,
            code: coupon.code,
            name: coupon.name,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            min_plan_value: coupon.min_plan_value,
            max_uses: coupon.max_uses,
            current_uses: coupon.current_uses || 0,
            expires_at: coupon.expires_at,
            is_active: coupon.is_active,
          });
        
        if (!error) count++;
      }
      results.restored.coupons = count;
    }

    if (shouldImport('bills_to_pay') && backup.data.bills_to_pay?.length > 0) {
      let count = 0;
      for (const bill of backup.data.bills_to_pay) {
        const sellerId = emailToSellerId.get(bill.seller_email);
        if (!sellerId) continue;
        
        const { error } = await supabase
          .from('bills_to_pay')
          .insert({
            seller_id: sellerId,
            description: bill.description,
            amount: bill.amount,
            due_date: bill.due_date,
            recipient_name: bill.recipient_name,
            recipient_pix: bill.recipient_pix,
            recipient_whatsapp: bill.recipient_whatsapp,
            is_paid: bill.is_paid,
            paid_at: bill.paid_at,
            notes: bill.notes,
          });
        
        if (!error) count++;
      }
      results.restored.bills_to_pay = count;
    }

    if (shouldImport('custom_products') && backup.data.custom_products?.length > 0) {
      let count = 0;
      for (const product of backup.data.custom_products) {
        const sellerId = emailToSellerId.get(product.seller_email);
        if (!sellerId) continue;
        
        const { error } = await supabase
          .from('custom_products')
          .insert({
            seller_id: sellerId,
            name: product.name,
            icon: product.icon,
            download_url: product.download_url,
            downloader_code: product.downloader_code,
            is_active: product.is_active,
          });
        
        if (!error) count++;
      }
      results.restored.custom_products = count;
    }

    // Step 8: Create server apps (depends on servers)
    if (shouldImport('server_apps') && backup.data.server_apps?.length > 0) {
      let count = 0;
      for (const app of backup.data.server_apps) {
        const sellerId = emailToSellerId.get(app.seller_email);
        const serverId = serverNameToId.get(`${app.seller_email}|${app.server_name}`);
        if (!sellerId || !serverId) continue;
        
        const { error } = await supabase
          .from('server_apps')
          .insert({
            seller_id: sellerId,
            server_id: serverId,
            name: app.name,
            app_type: app.app_type,
            download_url: app.download_url,
            downloader_code: app.downloader_code,
            website_url: app.website_url,
            icon: app.icon,
            notes: app.notes,
            is_active: app.is_active,
          });
        
        if (!error) count++;
      }
      results.restored.server_apps = count;
    }

    // Step 9: Create clients (depends on plans, servers)
    if (shouldImport('clients') && backup.data.clients?.length > 0) {
      console.log('Creating clients...');
      let count = 0;
      
      for (const client of backup.data.clients) {
        const sellerId = emailToSellerId.get(client.seller_email);
        if (!sellerId) continue;
        
        const planId = planNameToId.get(`${client.seller_email}|${client.plan_name}`);
        const serverId = serverNameToId.get(`${client.seller_email}|${client.server_name}`);
        const serverId2 = client.server_name_2 ? 
          serverNameToId.get(`${client.seller_email}|${client.server_name_2}`) : null;
        
        const { data: inserted, error } = await supabase
          .from('clients')
          .insert({
            seller_id: sellerId,
            name: client.name,
            phone: client.phone,
            email: client.email,
            login: client.login,
            password: client.password,
            login_2: client.login_2,
            password_2: client.password_2,
            plan_id: planId || null,
            plan_name: client.plan_name,
            plan_price: client.plan_price,
            server_id: serverId || null,
            server_name: client.server_name,
            server_id_2: serverId2,
            server_name_2: client.server_name_2,
            expiration_date: client.expiration_date,
            is_paid: client.is_paid,
            notes: client.notes,
            device: client.device,
            app_name: client.app_name,
            app_type: client.app_type,
            dns: client.dns,
            category: client.category,
            telegram: client.telegram,
            pending_amount: client.pending_amount,
            expected_payment_date: client.expected_payment_date,
            additional_servers: client.additional_servers,
            gerencia_app_mac: client.gerencia_app_mac,
            gerencia_app_devices: client.gerencia_app_devices,
            referral_code: client.referral_code,
            is_archived: client.is_archived,
          })
          .select('id')
          .single();
        
        if (error) {
          results.errors.push(`Client "${client.name}": ${error.message}`);
        } else {
          const identifier = client.email || client.phone || client.name;
          clientIdentifierToId.set(`${client.seller_email}|${identifier}`, inserted.id);
          count++;
        }
      }
      
      results.restored.clients = count;
    }

    // Step 10: Create tables that depend on clients
    if (shouldImport('panel_clients') && backup.data.panel_clients?.length > 0) {
      let count = 0;
      for (const pc of backup.data.panel_clients) {
        const sellerId = emailToSellerId.get(pc.seller_email);
        const clientId = clientIdentifierToId.get(`${pc.seller_email}|${pc.client_identifier}`);
        const panelId = panelNameToId.get(`${pc.seller_email}|${pc.panel_name}`);
        if (!sellerId || !clientId || !panelId) continue;
        
        const { error } = await supabase
          .from('panel_clients')
          .insert({
            seller_id: sellerId,
            client_id: clientId,
            panel_id: panelId,
            slot_type: pc.slot_type,
          });
        
        if (!error) count++;
      }
      results.restored.panel_clients = count;
    }

    if (shouldImport('client_external_apps') && backup.data.client_external_apps?.length > 0) {
      let count = 0;
      for (const cea of backup.data.client_external_apps) {
        const sellerId = emailToSellerId.get(cea.seller_email);
        const clientId = clientIdentifierToId.get(`${cea.seller_email}|${cea.client_identifier}`);
        const appId = extAppNameToId.get(`${cea.seller_email}|${cea.app_name}`);
        if (!sellerId || !clientId || !appId) continue;
        
        const { error } = await supabase
          .from('client_external_apps')
          .insert({
            seller_id: sellerId,
            client_id: clientId,
            external_app_id: appId,
            email: cea.email,
            password: cea.password,
            expiration_date: cea.expiration_date,
            devices: cea.devices,
            notes: cea.notes,
          });
        
        if (!error) count++;
      }
      results.restored.client_external_apps = count;
    }

    if (shouldImport('client_premium_accounts') && backup.data.client_premium_accounts?.length > 0) {
      let count = 0;
      for (const cpa of backup.data.client_premium_accounts) {
        const sellerId = emailToSellerId.get(cpa.seller_email);
        const clientId = clientIdentifierToId.get(`${cpa.seller_email}|${cpa.client_identifier}`);
        if (!sellerId || !clientId) continue;
        
        const { error } = await supabase
          .from('client_premium_accounts')
          .insert({
            seller_id: sellerId,
            client_id: clientId,
            plan_name: cpa.plan_name,
            email: cpa.email,
            password: cpa.password,
            price: cpa.price,
            expiration_date: cpa.expiration_date,
            notes: cpa.notes,
          });
        
        if (!error) count++;
      }
      results.restored.client_premium_accounts = count;
    }

    if (shouldImport('referrals') && backup.data.referrals?.length > 0) {
      let count = 0;
      for (const ref of backup.data.referrals) {
        const sellerId = emailToSellerId.get(ref.seller_email);
        const referrerId = clientIdentifierToId.get(`${ref.seller_email}|${ref.referrer_identifier}`);
        const referredId = clientIdentifierToId.get(`${ref.seller_email}|${ref.referred_identifier}`);
        if (!sellerId || !referrerId || !referredId) continue;
        
        const { error } = await supabase
          .from('referrals')
          .insert({
            seller_id: sellerId,
            referrer_client_id: referrerId,
            referred_client_id: referredId,
            discount_percentage: ref.discount_percentage,
            status: ref.status,
            completed_at: ref.completed_at,
          });
        
        if (!error) count++;
      }
      results.restored.referrals = count;
    }

    if (shouldImport('message_history') && backup.data.message_history?.length > 0) {
      let count = 0;
      for (const msg of backup.data.message_history) {
        const sellerId = emailToSellerId.get(msg.seller_email);
        const clientId = clientIdentifierToId.get(`${msg.seller_email}|${msg.client_identifier}`);
        const templateId = msg.template_name ? 
          templateNameToId.get(`${msg.seller_email}|${msg.template_name}`) : null;
        if (!sellerId || !clientId) continue;
        
        const { error } = await supabase
          .from('message_history')
          .insert({
            seller_id: sellerId,
            client_id: clientId,
            phone: msg.phone,
            message_type: msg.message_type,
            message_content: msg.message_content,
            template_id: templateId,
            sent_at: msg.sent_at,
          });
        
        if (!error) count++;
      }
      results.restored.message_history = count;
    }

    // Step 11: Monthly profits
    if (shouldImport('monthly_profits') && backup.data.monthly_profits?.length > 0) {
      let count = 0;
      for (const profit of backup.data.monthly_profits) {
        const sellerId = emailToSellerId.get(profit.seller_email);
        if (!sellerId) continue;
        
        const { error } = await supabase
          .from('monthly_profits')
          .insert({
            seller_id: sellerId,
            month: profit.month,
            year: profit.year,
            revenue: profit.revenue,
            server_costs: profit.server_costs,
            bills_costs: profit.bills_costs,
            net_profit: profit.net_profit,
            active_clients: profit.active_clients,
            closed_at: profit.closed_at,
          });
        
        if (!error) count++;
      }
      results.restored.monthly_profits = count;
    }

    // Clean up zero counts
    for (const key of Object.keys(results.restored)) {
      if (results.restored[key] === 0) {
        delete results.restored[key];
      }
    }

    console.log('Import completed:', results);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
