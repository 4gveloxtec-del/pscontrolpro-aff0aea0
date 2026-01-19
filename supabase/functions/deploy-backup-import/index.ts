import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportReport {
  success: boolean;
  imported: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
  warnings: string[];
  mappings: {
    profiles: number;
    clients: number;
    templates: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const report: ImportReport = {
    success: false,
    imported: {},
    skipped: {},
    errors: [],
    warnings: [],
    mappings: { profiles: 0, clients: 0, templates: 0 }
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
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
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { backup, mode = 'append', jobId } = await req.json();
    
    console.log(`[Deploy Import] Starting import for admin: ${user.id}`);
    console.log(`[Deploy Import] Backup version: ${backup?.version}, mode: ${mode}`);
    console.log(`[Deploy Import] Stats:`, backup?.stats);

    // Validate backup format
    if (!backup?.data || !backup?.version?.includes('deploy')) {
      return new Response(
        JSON.stringify({ error: 'Invalid deploy backup format. Expected version 2.0-deploy' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updateJob = async (updates: Record<string, any>) => {
      if (!jobId) return;
      try {
        await supabase
          .from('backup_import_jobs')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', jobId);
      } catch (e) {
        console.error('[Job Update Error]', e);
      }
    };

    await updateJob({ status: 'processing', progress: 5 });

    const data = backup.data;
    
    // Mapping: old seller_id -> new seller_id (UUID)
    const sellerIdMapping = new Map<string, string>();
    
    // Mapping: old plan_id -> new plan_id
    const planIdMapping = new Map<string, string>();
    
    // Mapping: old server_id -> new server_id
    const serverIdMapping = new Map<string, string>();
    
    // Mapping: old client_id -> new client_id
    const clientIdMapping = new Map<string, string>();
    
    // Mapping: old panel_id -> new panel_id
    const panelIdMapping = new Map<string, string>();

    // ===== PHASE 1: Import Profiles =====
    console.log('[Deploy Import] Phase 1: Importing profiles...');
    await updateJob({ status: 'processing', progress: 10 });

    // Get current admin's profile info
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', user.id)
      .single();
    
    const adminEmail = adminProfile?.email?.toLowerCase()?.trim();
    console.log(`[Deploy Import] Current admin email: ${adminEmail}`);

    const profiles = data.profiles || [];
    report.imported.profiles = 0;
    report.skipped.profiles = 0;

    for (const profile of profiles) {
      try {
        const oldId = profile.id;
        const email = profile.email?.toLowerCase()?.trim();
        
        if (!email) {
          report.warnings.push(`Profile without email skipped`);
          report.skipped.profiles = (report.skipped.profiles || 0) + 1;
          continue;
        }

        // Check if this is the current admin - map to existing admin ID
        if (email === adminEmail) {
          sellerIdMapping.set(oldId, user.id);
          report.skipped.profiles = (report.skipped.profiles || 0) + 1;
          console.log(`[Profile] ${email} is current admin, mapping ${oldId} -> ${user.id}`);
          report.warnings.push(`Admin ${email}: usando conta existente`);
          continue;
        }

        // Check if profile already exists by email
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (existingProfile) {
          // Map old ID to existing profile ID
          sellerIdMapping.set(oldId, existingProfile.id);
          report.skipped.profiles = (report.skipped.profiles || 0) + 1;
          console.log(`[Profile] ${email} already exists, mapping ${oldId} -> ${existingProfile.id}`);
          continue;
        }

        // Create new profile with new UUID
        const newId = crypto.randomUUID();
        
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: newId,
            email: email,
            full_name: profile.full_name,
            whatsapp: profile.whatsapp,
            pix_key: profile.pix_key,
            company_name: profile.company_name,
            is_active: profile.is_active ?? true,
            is_permanent: profile.is_permanent ?? false,
            subscription_expires_at: profile.subscription_expires_at,
            tutorial_visto: profile.tutorial_visto ?? false,
            needs_password_update: true, // Force password update on first login
            notification_days_before: profile.notification_days_before ?? 3,
          });

        if (insertError) {
          report.errors.push(`[profiles] ${email}: ${insertError.message}`);
        } else {
          sellerIdMapping.set(oldId, newId);
          report.imported.profiles = (report.imported.profiles || 0) + 1;
          console.log(`[Profile] Created ${email}: ${oldId} -> ${newId}`);
        }
      } catch (e) {
        report.errors.push(`[profiles] Error: ${(e as Error).message}`);
      }
    }

    report.mappings.profiles = sellerIdMapping.size;
    await updateJob({ progress: 20 });

    // ===== PHASE 2: Import Servers =====
    console.log('[Deploy Import] Phase 2: Importing servers...');
    
    const servers = data.servers || [];
    report.imported.servers = 0;
    report.skipped.servers = 0;

    for (const server of servers) {
      try {
        const oldId = server.id;
        const newSellerId = sellerIdMapping.get(server.seller_id);
        
        if (!newSellerId) {
          report.warnings.push(`Server ${server.name}: seller not found`);
          report.skipped.servers = (report.skipped.servers || 0) + 1;
          continue;
        }

        const { data: insertedServer, error: insertError } = await supabase
          .from('servers')
          .insert({
            seller_id: newSellerId,
            name: server.name,
            panel_url: server.panel_url,
            icon_url: server.icon_url,
            monthly_cost: server.monthly_cost ?? 0,
            is_active: server.is_active ?? true,
            notes: server.notes,
            is_credit_based: server.is_credit_based ?? false,
            total_credits: server.total_credits,
            used_credits: server.used_credits,
            credit_price: server.credit_price,
            credit_value: server.credit_value,
            iptv_per_credit: server.iptv_per_credit,
            p2p_per_credit: server.p2p_per_credit,
            total_screens_per_credit: server.total_screens_per_credit,
          })
          .select('id')
          .single();

        if (insertError) {
          report.errors.push(`[servers] ${server.name}: ${insertError.message}`);
        } else if (insertedServer) {
          serverIdMapping.set(oldId, insertedServer.id);
          report.imported.servers = (report.imported.servers || 0) + 1;
        }
      } catch (e) {
        report.errors.push(`[servers] Error: ${(e as Error).message}`);
      }
    }

    await updateJob({ progress: 30 });

    // ===== PHASE 3: Import Plans =====
    console.log('[Deploy Import] Phase 3: Importing plans...');
    
    const plans = data.plans || [];
    report.imported.plans = 0;
    report.skipped.plans = 0;

    for (const plan of plans) {
      try {
        const oldId = plan.id;
        const newSellerId = sellerIdMapping.get(plan.seller_id);
        
        if (!newSellerId) {
          report.warnings.push(`Plan ${plan.name}: seller not found`);
          report.skipped.plans = (report.skipped.plans || 0) + 1;
          continue;
        }

        const { data: insertedPlan, error: insertError } = await supabase
          .from('plans')
          .insert({
            seller_id: newSellerId,
            name: plan.name,
            price: plan.price ?? 0,
            duration_days: plan.duration_days ?? 30,
            description: plan.description,
            category: plan.category,
            screens: plan.screens,
            is_active: plan.is_active ?? true,
          })
          .select('id')
          .single();

        if (insertError) {
          report.errors.push(`[plans] ${plan.name}: ${insertError.message}`);
        } else if (insertedPlan) {
          planIdMapping.set(oldId, insertedPlan.id);
          report.imported.plans = (report.imported.plans || 0) + 1;
        }
      } catch (e) {
        report.errors.push(`[plans] Error: ${(e as Error).message}`);
      }
    }

    await updateJob({ progress: 40 });

    // ===== PHASE 4: Import Clients =====
    console.log('[Deploy Import] Phase 4: Importing clients...');
    
    const clients = data.clients || [];
    report.imported.clients = 0;
    report.skipped.clients = 0;

    // Process in batches for better performance
    const BATCH_SIZE = 50;
    const clientBatches = [];
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      clientBatches.push(clients.slice(i, i + BATCH_SIZE));
    }

    let processedClients = 0;
    for (const batch of clientBatches) {
      const clientsToInsert = [];
      
      for (const client of batch) {
        const oldId = client.id;
        const newSellerId = sellerIdMapping.get(client.seller_id);
        
        if (!newSellerId) {
          report.warnings.push(`Client ${client.name}: seller ${client.seller_id} not mapped`);
          report.skipped.clients = (report.skipped.clients || 0) + 1;
          continue;
        }

        // Map foreign keys
        const newPlanId = client.plan_id ? planIdMapping.get(client.plan_id) : null;
        const newServerId = client.server_id ? serverIdMapping.get(client.server_id) : null;
        const newServerId2 = client.server_id_2 ? serverIdMapping.get(client.server_id_2) : null;

        clientsToInsert.push({
          _old_id: oldId, // Temporary field for mapping
          seller_id: newSellerId,
          name: client.name,
          phone: client.phone,
          email: client.email,
          device: client.device,
          expiration_date: client.expiration_date,
          plan_id: newPlanId,
          plan_name: client.plan_name,
          plan_price: client.plan_price ?? 0,
          server_id: newServerId,
          server_name: client.server_name,
          server_id_2: newServerId2,
          server_name_2: client.server_name_2,
          login: client.login,
          password: client.password,
          login_2: client.login_2,
          password_2: client.password_2,
          is_paid: client.is_paid ?? false,
          notes: client.notes,
          referral_code: client.referral_code,
          category: client.category,
          premium_password: client.premium_password,
          premium_price: client.premium_price,
          has_paid_apps: client.has_paid_apps ?? false,
          paid_apps_duration: client.paid_apps_duration,
          paid_apps_expiration: client.paid_apps_expiration,
          paid_apps_email: client.paid_apps_email,
          paid_apps_password: client.paid_apps_password,
          app_name: client.app_name,
          app_type: client.app_type,
          telegram: client.telegram,
          is_archived: client.is_archived ?? false,
          archived_at: client.archived_at,
          renewed_at: client.renewed_at,
          gerencia_app_mac: client.gerencia_app_mac,
          gerencia_app_devices: client.gerencia_app_devices,
          pending_amount: client.pending_amount ?? 0,
          dns: client.dns,
          expected_payment_date: client.expected_payment_date,
          credentials_fingerprint: client.credentials_fingerprint,
          additional_servers: client.additional_servers,
        });
      }

      // Insert batch
      for (const clientData of clientsToInsert) {
        const oldId = clientData._old_id;
        delete clientData._old_id;

        try {
          const { data: insertedClient, error: insertError } = await supabase
            .from('clients')
            .insert(clientData)
            .select('id')
            .single();

          if (insertError) {
            report.errors.push(`[clients] ${clientData.name}: ${insertError.message}`);
          } else if (insertedClient) {
            clientIdMapping.set(oldId, insertedClient.id);
            report.imported.clients = (report.imported.clients || 0) + 1;
          }
        } catch (e) {
          report.errors.push(`[clients] ${clientData.name}: ${(e as Error).message}`);
        }
      }

      processedClients += batch.length;
      const progress = 40 + Math.floor((processedClients / clients.length) * 30);
      await updateJob({ progress, processed_items: processedClients });
    }

    report.mappings.clients = clientIdMapping.size;
    await updateJob({ progress: 70 });

    // ===== PHASE 5: Import WhatsApp Templates =====
    console.log('[Deploy Import] Phase 5: Importing WhatsApp templates...');
    
    const templates = data.whatsapp_templates || [];
    report.imported.whatsapp_templates = 0;
    report.skipped.whatsapp_templates = 0;

    for (const template of templates) {
      try {
        const newSellerId = sellerIdMapping.get(template.seller_id);
        
        if (!newSellerId) {
          report.warnings.push(`Template ${template.name}: seller not found`);
          report.skipped.whatsapp_templates = (report.skipped.whatsapp_templates || 0) + 1;
          continue;
        }

        // Check for duplicate template (same name and type for same seller)
        const { data: existing } = await supabase
          .from('whatsapp_templates')
          .select('id')
          .eq('seller_id', newSellerId)
          .eq('name', template.name)
          .eq('type', template.type)
          .single();

        if (existing) {
          report.skipped.whatsapp_templates = (report.skipped.whatsapp_templates || 0) + 1;
          continue;
        }

        const { error: insertError } = await supabase
          .from('whatsapp_templates')
          .insert({
            seller_id: newSellerId,
            name: template.name,
            type: template.type,
            message: template.message,
            is_default: template.is_default ?? false,
          });

        if (insertError) {
          report.errors.push(`[templates] ${template.name}: ${insertError.message}`);
        } else {
          report.imported.whatsapp_templates = (report.imported.whatsapp_templates || 0) + 1;
        }
      } catch (e) {
        report.errors.push(`[templates] Error: ${(e as Error).message}`);
      }
    }

    report.mappings.templates = report.imported.whatsapp_templates || 0;
    await updateJob({ progress: 80 });

    // ===== PHASE 6: Import Shared Panels =====
    console.log('[Deploy Import] Phase 6: Importing shared panels...');
    
    const panels = data.shared_panels || [];
    report.imported.shared_panels = 0;
    report.skipped.shared_panels = 0;

    for (const panel of panels) {
      try {
        const oldId = panel.id;
        const newSellerId = sellerIdMapping.get(panel.seller_id);
        
        if (!newSellerId) {
          report.skipped.shared_panels = (report.skipped.shared_panels || 0) + 1;
          continue;
        }

        const { data: insertedPanel, error: insertError } = await supabase
          .from('shared_panels')
          .insert({
            seller_id: newSellerId,
            name: panel.name,
            panel_type: panel.panel_type,
            url: panel.url,
            login: panel.login,
            password: panel.password,
            monthly_cost: panel.monthly_cost ?? 0,
            total_slots: panel.total_slots ?? 0,
            used_slots: panel.used_slots ?? 0,
            used_iptv_slots: panel.used_iptv_slots ?? 0,
            used_p2p_slots: panel.used_p2p_slots ?? 0,
            iptv_per_credit: panel.iptv_per_credit,
            p2p_per_credit: panel.p2p_per_credit,
            expires_at: panel.expires_at,
            is_active: panel.is_active ?? true,
            notes: panel.notes,
          })
          .select('id')
          .single();

        if (insertError) {
          report.errors.push(`[panels] ${panel.name}: ${insertError.message}`);
        } else if (insertedPanel) {
          panelIdMapping.set(oldId, insertedPanel.id);
          report.imported.shared_panels = (report.imported.shared_panels || 0) + 1;
        }
      } catch (e) {
        report.errors.push(`[panels] Error: ${(e as Error).message}`);
      }
    }

    await updateJob({ progress: 85 });

    // ===== PHASE 7: Import Panel Clients =====
    console.log('[Deploy Import] Phase 7: Importing panel clients...');
    
    const panelClients = data.panel_clients || [];
    report.imported.panel_clients = 0;
    report.skipped.panel_clients = 0;

    for (const pc of panelClients) {
      try {
        const newSellerId = sellerIdMapping.get(pc.seller_id);
        const newPanelId = panelIdMapping.get(pc.panel_id);
        const newClientId = clientIdMapping.get(pc.client_id);
        
        if (!newSellerId || !newPanelId || !newClientId) {
          report.skipped.panel_clients = (report.skipped.panel_clients || 0) + 1;
          continue;
        }

        const { error: insertError } = await supabase
          .from('panel_clients')
          .insert({
            seller_id: newSellerId,
            panel_id: newPanelId,
            client_id: newClientId,
            slot_type: pc.slot_type ?? 'standard',
          });

        if (insertError) {
          report.errors.push(`[panel_clients]: ${insertError.message}`);
        } else {
          report.imported.panel_clients = (report.imported.panel_clients || 0) + 1;
        }
      } catch (e) {
        report.errors.push(`[panel_clients] Error: ${(e as Error).message}`);
      }
    }

    await updateJob({ progress: 90 });

    // ===== PHASE 8: Import Other Tables =====
    console.log('[Deploy Import] Phase 8: Importing other tables...');

    // Coupons
    const coupons = data.coupons || [];
    report.imported.coupons = 0;
    for (const coupon of coupons) {
      const newSellerId = sellerIdMapping.get(coupon.seller_id);
      if (!newSellerId) continue;
      
      try {
        const { error } = await supabase.from('coupons').insert({
          seller_id: newSellerId,
          name: coupon.name,
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value ?? 0,
          min_plan_value: coupon.min_plan_value,
          max_uses: coupon.max_uses,
          current_uses: coupon.current_uses ?? 0,
          expires_at: coupon.expires_at,
          is_active: coupon.is_active ?? true,
        });
        if (!error) report.imported.coupons = (report.imported.coupons || 0) + 1;
      } catch (e) { /* ignore */ }
    }

    // Bills to pay
    const bills = data.bills_to_pay || [];
    report.imported.bills_to_pay = 0;
    for (const bill of bills) {
      const newSellerId = sellerIdMapping.get(bill.seller_id);
      if (!newSellerId) continue;
      
      try {
        const { error } = await supabase.from('bills_to_pay').insert({
          seller_id: newSellerId,
          description: bill.description,
          amount: bill.amount ?? 0,
          due_date: bill.due_date,
          is_paid: bill.is_paid ?? false,
          paid_at: bill.paid_at,
          recipient_name: bill.recipient_name,
          recipient_whatsapp: bill.recipient_whatsapp,
          recipient_pix: bill.recipient_pix,
          notes: bill.notes,
        });
        if (!error) report.imported.bills_to_pay = (report.imported.bills_to_pay || 0) + 1;
      } catch (e) { /* ignore */ }
    }

    // Client categories
    const categories = data.client_categories || [];
    report.imported.client_categories = 0;
    for (const cat of categories) {
      const newSellerId = sellerIdMapping.get(cat.seller_id);
      if (!newSellerId) continue;
      
      try {
        const { error } = await supabase.from('client_categories').insert({
          seller_id: newSellerId,
          name: cat.name,
        });
        if (!error) report.imported.client_categories = (report.imported.client_categories || 0) + 1;
      } catch (e) { /* ignore */ }
    }

    // Referrals
    const referrals = data.referrals || [];
    report.imported.referrals = 0;
    for (const ref of referrals) {
      const newSellerId = sellerIdMapping.get(ref.seller_id);
      const newReferrerId = clientIdMapping.get(ref.referrer_client_id);
      const newReferredId = clientIdMapping.get(ref.referred_client_id);
      if (!newSellerId || !newReferrerId || !newReferredId) continue;
      
      try {
        const { error } = await supabase.from('referrals').insert({
          seller_id: newSellerId,
          referrer_client_id: newReferrerId,
          referred_client_id: newReferredId,
          discount_percentage: ref.discount_percentage,
          status: ref.status,
          completed_at: ref.completed_at,
        });
        if (!error) report.imported.referrals = (report.imported.referrals || 0) + 1;
      } catch (e) { /* ignore */ }
    }

    await updateJob({ progress: 95 });

    // ===== FINALIZE =====
    report.success = true;
    
    const totalImported = Object.values(report.imported).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(report.skipped).reduce((a, b) => a + b, 0);
    
    console.log(`[Deploy Import] Complete! Imported: ${totalImported}, Skipped: ${totalSkipped}, Errors: ${report.errors.length}`);

    await updateJob({ 
      status: 'completed', 
      progress: 100,
      restored: report.imported,
      errors: report.errors.slice(0, 50), // Limit errors stored
      warnings: report.warnings.slice(0, 50),
    });

    return new Response(
      JSON.stringify({
        success: true,
        report,
        message: `Importação concluída! ${totalImported} registros importados.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Deploy Import] Fatal error:', error);
    report.errors.push(`Fatal: ${(error as Error).message}`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message,
        report 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
