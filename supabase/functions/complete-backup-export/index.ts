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

    // Check if user is admin (robust: tolerate duplicates / missing single-row)
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      console.error('Failed to load user role:', roleError.message);
      return new Response(
        JSON.stringify({ error: 'Falha ao verificar permissões de admin.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasAdminRole = Array.isArray(roleRows) && roleRows.some((r: any) => r?.role === 'admin');

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating complete clean backup by admin: ${user.email}`);

    // Fetch ALL data from all tables
    const [
      profilesRes,
      userRolesRes,
      clientsRes,
      serversRes,
      plansRes,
      externalAppsRes,
      clientExternalAppsRes,
      templatesRes,
      sharedPanelsRes,
      panelClientsRes,
      billsRes,
      couponsRes,
      categoriesRes,
      customProductsRes,
      referralsRes,
      messageHistoryRes,
      monthlyProfitsRes,
      appSettingsRes,
      serverAppsRes,
      clientPremiumAccountsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('servers').select('*'),
      supabase.from('plans').select('*'),
      supabase.from('external_apps').select('*'),
      supabase.from('client_external_apps').select('*'),
      supabase.from('whatsapp_templates').select('*'),
      supabase.from('shared_panels').select('*'),
      supabase.from('panel_clients').select('*'),
      supabase.from('bills_to_pay').select('*'),
      supabase.from('coupons').select('*'),
      supabase.from('client_categories').select('*'),
      supabase.from('custom_products').select('*'),
      supabase.from('referrals').select('*'),
      supabase.from('message_history').select('*'),
      supabase.from('monthly_profits').select('*'),
      supabase.from('app_settings').select('*'),
      supabase.from('server_apps').select('*'),
      supabase.from('client_premium_accounts').select('*'),
    ]);

    // Create ID to email/name mapping for profiles
    const profileMap = new Map<string, string>();
    const profiles = profilesRes.data || [];
    profiles.forEach((p: any) => profileMap.set(p.id, p.email));

    // Create server ID to name mapping
    const serverMap = new Map<string, { name: string; seller_email: string }>();
    const servers = serversRes.data || [];
    servers.forEach((s: any) => serverMap.set(s.id, { 
      name: s.name, 
      seller_email: profileMap.get(s.seller_id) || '' 
    }));

    // Create plan ID to name mapping
    const planMap = new Map<string, { name: string; seller_email: string }>();
    const plans = plansRes.data || [];
    plans.forEach((p: any) => planMap.set(p.id, { 
      name: p.name, 
      seller_email: profileMap.get(p.seller_id) || '' 
    }));

    // Create client ID mapping
    const clientMap = new Map<string, { identifier: string; seller_email: string }>();
    const clients = clientsRes.data || [];
    clients.forEach((c: any) => clientMap.set(c.id, { 
      identifier: c.email || c.phone || c.name,
      seller_email: profileMap.get(c.seller_id) || ''
    }));

    // Create external app ID mapping
    const extAppMap = new Map<string, { name: string; seller_email: string }>();
    const externalApps = externalAppsRes.data || [];
    externalApps.forEach((a: any) => extAppMap.set(a.id, {
      name: a.name,
      seller_email: profileMap.get(a.seller_id) || ''
    }));

    // Create template ID mapping
    const templateMap = new Map<string, { name: string; seller_email: string }>();
    const templates = templatesRes.data || [];
    templates.forEach((t: any) => templateMap.set(t.id, {
      name: t.name,
      seller_email: profileMap.get(t.seller_id) || ''
    }));

    // Create panel ID mapping
    const panelMap = new Map<string, { name: string; seller_email: string }>();
    const sharedPanels = sharedPanelsRes.data || [];
    sharedPanels.forEach((p: any) => panelMap.set(p.id, {
      name: p.name,
      seller_email: profileMap.get(p.seller_id) || ''
    }));

    // Transform profiles (exclude admin)
    const transformedProfiles = profiles
      .filter((p: any) => {
        const role = (userRolesRes.data || []).find((r: any) => r.user_id === p.id);
        return role?.role !== 'admin';
      })
      .map((p: any) => {
        const role = (userRolesRes.data || []).find((r: any) => r.user_id === p.id);
        return {
          email: p.email,
          full_name: p.full_name,
          company_name: p.company_name,
          whatsapp: p.whatsapp,
          pix_key: p.pix_key,
          is_active: p.is_active,
          is_permanent: p.is_permanent,
          subscription_expires_at: p.subscription_expires_at,
          notification_days_before: p.notification_days_before,
          role: role?.role || 'seller'
        };
      });

    // Transform clients
    const transformedClients = clients.map((c: any) => ({
      seller_email: profileMap.get(c.seller_id) || '',
      name: c.name,
      phone: c.phone,
      email: c.email,
      login: c.login,
      password: c.password,
      login_2: c.login_2,
      password_2: c.password_2,
      plan_name: c.plan_name,
      server_name: c.server_name,
      server_name_2: c.server_name_2,
      expiration_date: c.expiration_date,
      is_paid: c.is_paid,
      notes: c.notes,
      device: c.device,
      app_name: c.app_name,
      app_type: c.app_type,
      dns: c.dns,
      category: c.category,
      telegram: c.telegram,
      pending_amount: c.pending_amount,
      expected_payment_date: c.expected_payment_date,
      additional_servers: c.additional_servers,
      gerencia_app_mac: c.gerencia_app_mac,
      gerencia_app_devices: c.gerencia_app_devices,
      referral_code: c.referral_code,
      is_archived: c.is_archived,
    }));

    // Transform servers
    const transformedServers = servers.map((s: any) => ({
      seller_email: profileMap.get(s.seller_id) || '',
      name: s.name,
      panel_url: s.panel_url,
      monthly_cost: s.monthly_cost,
      is_credit_based: s.is_credit_based,
      total_credits: s.total_credits,
      used_credits: s.used_credits,
      credit_price: s.credit_price,
      credit_value: s.credit_value,
      iptv_per_credit: s.iptv_per_credit,
      p2p_per_credit: s.p2p_per_credit,
      total_screens_per_credit: s.total_screens_per_credit,
      icon_url: s.icon_url,
      notes: s.notes,
      is_active: s.is_active,
    }));

    // Transform plans
    const transformedPlans = plans.map((p: any) => ({
      seller_email: profileMap.get(p.seller_id) || '',
      name: p.name,
      price: p.price,
      duration_days: p.duration_days,
      category: p.category,
      description: p.description,
      screens: p.screens,
      is_active: p.is_active,
    }));

    // Transform external apps
    const transformedExternalApps = externalApps.map((a: any) => ({
      seller_email: profileMap.get(a.seller_id) || '',
      name: a.name,
      auth_type: a.auth_type,
      price: a.price,
      cost: a.cost,
      website_url: a.website_url,
      download_url: a.download_url,
      is_active: a.is_active,
    }));

    // Transform client external apps
    const clientExternalApps = clientExternalAppsRes.data || [];
    const transformedClientExternalApps = clientExternalApps.map((a: any) => {
      const client = clientMap.get(a.client_id);
      const app = extAppMap.get(a.external_app_id);
      return {
        client_identifier: client?.identifier || '',
        app_name: app?.name || '',
        seller_email: profileMap.get(a.seller_id) || '',
        email: a.email,
        password: a.password,
        expiration_date: a.expiration_date,
        devices: a.devices,
        notes: a.notes,
      };
    });

    // Transform templates
    const transformedTemplates = templates.map((t: any) => ({
      seller_email: profileMap.get(t.seller_id) || '',
      name: t.name,
      type: t.type,
      message: t.message,
      is_default: t.is_default,
      category: t.category,
      description: t.description,
    }));

    // Transform shared panels
    const transformedPanels = sharedPanels.map((p: any) => ({
      seller_email: profileMap.get(p.seller_id) || '',
      name: p.name,
      panel_type: p.panel_type,
      monthly_cost: p.monthly_cost,
      total_slots: p.total_slots,
      used_slots: p.used_slots,
      used_iptv_slots: p.used_iptv_slots,
      used_p2p_slots: p.used_p2p_slots,
      url: p.url,
      login: p.login,
      password: p.password,
      expires_at: p.expires_at,
      iptv_per_credit: p.iptv_per_credit,
      p2p_per_credit: p.p2p_per_credit,
      notes: p.notes,
      is_active: p.is_active,
    }));

    // Transform panel clients
    const panelClients = panelClientsRes.data || [];
    const transformedPanelClients = panelClients.map((pc: any) => {
      const client = clientMap.get(pc.client_id);
      const panel = panelMap.get(pc.panel_id);
      return {
        client_identifier: client?.identifier || '',
        panel_name: panel?.name || '',
        seller_email: profileMap.get(pc.seller_id) || '',
        slot_type: pc.slot_type,
        assigned_at: pc.assigned_at,
      };
    });

    // Transform bills
    const bills = billsRes.data || [];
    const transformedBills = bills.map((b: any) => ({
      seller_email: profileMap.get(b.seller_id) || '',
      description: b.description,
      amount: b.amount,
      due_date: b.due_date,
      recipient_name: b.recipient_name,
      recipient_pix: b.recipient_pix,
      recipient_whatsapp: b.recipient_whatsapp,
      is_paid: b.is_paid,
      paid_at: b.paid_at,
      notes: b.notes,
    }));

    // Transform coupons
    const coupons = couponsRes.data || [];
    const transformedCoupons = coupons.map((c: any) => ({
      seller_email: profileMap.get(c.seller_id) || '',
      code: c.code,
      name: c.name,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_plan_value: c.min_plan_value,
      max_uses: c.max_uses,
      current_uses: c.current_uses,
      expires_at: c.expires_at,
      is_active: c.is_active,
    }));

    // Transform categories
    const categories = categoriesRes.data || [];
    const transformedCategories = categories.map((c: any) => ({
      seller_email: profileMap.get(c.seller_id) || '',
      name: c.name,
    }));

    // Transform custom products
    const customProducts = customProductsRes.data || [];
    const transformedCustomProducts = customProducts.map((p: any) => ({
      seller_email: profileMap.get(p.seller_id) || '',
      name: p.name,
      icon: p.icon,
      download_url: p.download_url,
      downloader_code: p.downloader_code,
      is_active: p.is_active,
    }));

    // Transform referrals
    const referrals = referralsRes.data || [];
    const transformedReferrals = referrals.map((r: any) => {
      const referrer = clientMap.get(r.referrer_client_id);
      const referred = clientMap.get(r.referred_client_id);
      return {
        seller_email: profileMap.get(r.seller_id) || '',
        referrer_identifier: referrer?.identifier || '',
        referred_identifier: referred?.identifier || '',
        discount_percentage: r.discount_percentage,
        status: r.status,
        completed_at: r.completed_at,
      };
    });

    // Transform message history
    const messageHistory = messageHistoryRes.data || [];
    const transformedMessageHistory = messageHistory.map((m: any) => {
      const client = clientMap.get(m.client_id);
      const template = templateMap.get(m.template_id);
      return {
        seller_email: profileMap.get(m.seller_id) || '',
        client_identifier: client?.identifier || '',
        phone: m.phone,
        message_type: m.message_type,
        message_content: m.message_content,
        template_name: template?.name || null,
        sent_at: m.sent_at,
      };
    });

    // Transform monthly profits
    const monthlyProfits = monthlyProfitsRes.data || [];
    const transformedMonthlyProfits = monthlyProfits.map((p: any) => ({
      seller_email: profileMap.get(p.seller_id) || '',
      month: p.month,
      year: p.year,
      revenue: p.revenue,
      server_costs: p.server_costs,
      bills_costs: p.bills_costs,
      net_profit: p.net_profit,
      active_clients: p.active_clients,
      closed_at: p.closed_at,
    }));

    // Transform server apps
    const serverApps = serverAppsRes.data || [];
    const transformedServerApps = serverApps.map((a: any) => {
      const server = serverMap.get(a.server_id);
      return {
        seller_email: profileMap.get(a.seller_id) || '',
        server_name: server?.name || '',
        name: a.name,
        app_type: a.app_type,
        download_url: a.download_url,
        downloader_code: a.downloader_code,
        website_url: a.website_url,
        icon: a.icon,
        notes: a.notes,
        is_active: a.is_active,
      };
    });

    // Transform client premium accounts
    const clientPremiumAccounts = clientPremiumAccountsRes.data || [];
    const transformedClientPremiumAccounts = clientPremiumAccounts.map((a: any) => {
      const client = clientMap.get(a.client_id);
      return {
        seller_email: profileMap.get(a.seller_id) || '',
        client_identifier: client?.identifier || '',
        plan_name: a.plan_name,
        email: a.email,
        password: a.password,
        price: a.price,
        expiration_date: a.expiration_date,
        notes: a.notes,
      };
    });

    // Transform app settings (only non-sensitive ones)
    const appSettings = appSettingsRes.data || [];
    const transformedAppSettings = appSettings
      .filter((s: any) => !s.key.includes('secret') && !s.key.includes('token'))
      .map((s: any) => ({
        key: s.key,
        value: s.value,
        description: s.description,
      }));

    const backup = {
      version: "2.0",
      type: "complete_clean_backup",
      exported_at: new Date().toISOString(),
      exported_by: user.email,
      data: {
        profiles: transformedProfiles,
        clients: transformedClients,
        servers: transformedServers,
        plans: transformedPlans,
        external_apps: transformedExternalApps,
        client_external_apps: transformedClientExternalApps,
        whatsapp_templates: transformedTemplates,
        shared_panels: transformedPanels,
        panel_clients: transformedPanelClients,
        bills_to_pay: transformedBills,
        coupons: transformedCoupons,
        client_categories: transformedCategories,
        custom_products: transformedCustomProducts,
        referrals: transformedReferrals,
        message_history: transformedMessageHistory,
        monthly_profits: transformedMonthlyProfits,
        server_apps: transformedServerApps,
        client_premium_accounts: transformedClientPremiumAccounts,
        app_settings: transformedAppSettings,
      },
      stats: {
        profiles: transformedProfiles.length,
        clients: transformedClients.length,
        servers: transformedServers.length,
        plans: transformedPlans.length,
        external_apps: transformedExternalApps.length,
        client_external_apps: transformedClientExternalApps.length,
        whatsapp_templates: transformedTemplates.length,
        shared_panels: transformedPanels.length,
        panel_clients: transformedPanelClients.length,
        bills_to_pay: transformedBills.length,
        coupons: transformedCoupons.length,
        client_categories: transformedCategories.length,
        custom_products: transformedCustomProducts.length,
        referrals: transformedReferrals.length,
        message_history: transformedMessageHistory.length,
        monthly_profits: transformedMonthlyProfits.length,
        server_apps: transformedServerApps.length,
        client_premium_accounts: transformedClientPremiumAccounts.length,
        app_settings: transformedAppSettings.length,
      }
    };

    console.log(`Backup created with stats:`, backup.stats);

    return new Response(
      JSON.stringify(backup),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Backup export error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
