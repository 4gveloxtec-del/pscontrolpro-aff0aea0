import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ordem exata de processamento conforme especificado
const IMPORT_ORDER = [
  'profiles',
  'servers',
  'plans',
  'clients',
  'coupons',
  'referrals',
  'whatsapp_templates',
  'bills_to_pay',
  'shared_panels',
  'panel_clients',
  'message_history',
  'client_categories',
  'external_apps',
  'client_external_apps',
  'client_premium_accounts',
  'custom_products',
  'app_settings',
  'monthly_profits',
  'default_server_icons',
] as const;

const BATCH_SIZE = 500;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let jobId: string | null = null;
  let currentTable: string | null = null;

  // Helper to save error to job
  const saveJobError = async (errorMessage: string, tableName?: string) => {
    const fullError = tableName 
      ? `Erro na tabela "${tableName}": ${errorMessage}`
      : errorMessage;
    
    if (jobId) {
      try {
        await supabase
          .from('backup_import_jobs')
          .update({
            status: 'failed',
            errors: [fullError],
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (e) {
        console.error('Failed to save job error:', e);
      }
    }
    return fullError;
  };

  try {
    console.log(`=== COMPLETE-BACKUP-IMPORT V2 STARTED ===`);
    
    // ==========================================
    // 1. AUTENTICAÇÃO E VALIDAÇÃO DE ADMIN
    // ==========================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email;
    console.log(`Usuário autenticado: ${userEmail} (${userId})`);

    // Verificar role de admin
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (roleError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao verificar permissões.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasAdminRole = Array.isArray(roleRows) && roleRows.some((r: any) => r?.role === 'admin');
    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores podem restaurar backups.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Role de admin verificada');

    // ==========================================
    // 2. PARSE DO BODY E VALIDAÇÃO DO BACKUP
    // ==========================================
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao processar o arquivo. Verifique se o JSON é válido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { backup, mode, modules, jobId: receivedJobId } = requestBody;
    jobId = receivedJobId;

    console.log(`=== CONFIG ===`);
    console.log(`Mode: ${mode}, JobId: ${jobId}`);
    console.log(`Backup keys:`, Object.keys(backup || {}));
    console.log(`Data keys:`, Object.keys(backup?.data || {}));
    console.log(`Modules:`, modules);

    // Validar estrutura do backup
    if (!backup || !backup.data || typeof backup.data !== 'object') {
      const errorMsg = 'Formato de backup inválido. Estrutura "data" não encontrada.';
      await saveJobError(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se há dados para restaurar
    const hasAnyData = Object.values(backup.data).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    if (!hasAnyData) {
      const errorMsg = 'Backup vazio. Nenhum dado para restaurar.';
      await saveJobError(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // 3. INICIALIZAÇÃO DO JOB
    // ==========================================
    const results = {
      success: true,
      restored: {} as Record<string, number>,
      errors: [] as string[],
      skipped: {} as Record<string, number>,
      warnings: [] as string[],
    };

    // Calcular total de itens
    let totalItems = 0;
    for (const key of IMPORT_ORDER) {
      const arr = backup.data[key];
      if (Array.isArray(arr)) totalItems += arr.length;
    }
    let processedItems = 0;

    console.log(`Total de itens a processar: ${totalItems}`);

    // Atualizar job para "processing"
    if (jobId) {
      await supabase
        .from('backup_import_jobs')
        .update({
          status: 'processing',
          progress: 1,
          total_items: totalItems,
          processed_items: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    // ==========================================
    // 4. HELPERS
    // ==========================================
    const updateProgress = async (status: string = 'processing') => {
      if (!jobId) return;
      const progress = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
      try {
        await supabase
          .from('backup_import_jobs')
          .update({
            status,
            progress,
            processed_items: processedItems,
            total_items: totalItems,
            restored: results.restored,
            warnings: results.warnings.slice(-100),
            errors: results.errors.slice(-100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (e) {
        console.error('Failed to update progress:', e);
      }
    };

    const getSellerEmail = (item: any): string | undefined => {
      return item.seller_email || item._seller_email || item.email;
    };

    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
      return chunks;
    };

    const isDuplicateError = (msg?: string) => {
      const m = (msg || '').toLowerCase();
      return m.includes('duplicate') || m.includes('unique') || m.includes('already exists');
    };

    // Insert em batches com fallback para row-by-row
    const insertBatch = async (
      table: string,
      rows: any[],
      options?: { ignoreDuplicates?: boolean }
    ): Promise<{ inserted: number; errors: string[] }> => {
      if (!rows.length) return { inserted: 0, errors: [] };

      let inserted = 0;
      const errors: string[] = [];

      for (const chunk of chunkArray(rows, BATCH_SIZE)) {
        const { data, error } = await supabase.from(table).insert(chunk).select('id');

        if (error) {
          console.log(`[${table}] Batch falhou (${chunk.length} rows): ${error.message}. Tentando row-by-row...`);
          
          // Fallback para inserção individual
          for (const row of chunk) {
            const { error: rowError } = await supabase.from(table).insert(row);
            if (rowError) {
              if (options?.ignoreDuplicates && isDuplicateError(rowError.message)) {
                // Ignorar silenciosamente
              } else {
                errors.push(rowError.message);
              }
            } else {
              inserted++;
            }
            processedItems++;
          }
        } else {
          inserted += chunk.length;
          processedItems += chunk.length;
        }

        await updateProgress();
      }

      return { inserted, errors };
    };

    // Verificar se módulo deve ser importado
    const shouldImport = (moduleName: string): boolean => {
      if (!modules || modules.length === 0) return true;
      return modules.includes(moduleName);
    };

    // ==========================================
    // 5. MAPAS DE RELACIONAMENTO
    // ==========================================
    const emailToSellerId = new Map<string, string>();
    const sellerIdToEmail = new Map<string, string>();
    const serverNameToId = new Map<string, string>();
    const planNameToId = new Map<string, string>();
    const clientIdentifierToId = new Map<string, string>();
    const extAppNameToId = new Map<string, string>();
    const templateNameToId = new Map<string, string>();
    const panelNameToId = new Map<string, string>();

    // Obter perfil do admin atual
    const { data: currentAdminProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (currentAdminProfile) {
      emailToSellerId.set(currentAdminProfile.email, userId);
      sellerIdToEmail.set(userId, currentAdminProfile.email);
      console.log(`Admin mapeado: ${currentAdminProfile.email} -> ${userId}`);
    }

    // ==========================================
    // 6. MODO REPLACE - LIMPAR BASE
    // ==========================================
    if (mode === 'replace') {
      console.log('=== LIMPANDO BASE (preservando admin) ===');
      currentTable = 'cleanup';

      try {
        // Obter todos os sellers exceto o admin
        const { data: sellerProfiles } = await supabase
          .from('profiles')
          .select('id')
          .neq('id', userId);
        
        const sellerIds = sellerProfiles?.map((p: any) => p.id) || [];
        
        if (sellerIds.length > 0) {
          console.log(`Deletando dados de ${sellerIds.length} sellers...`);
          
          // Ordem correta para respeitar foreign keys
          const deleteOrder = [
            'client_notification_tracking',
            'client_external_apps',
            'client_premium_accounts',
            'panel_clients',
            'message_history',
            'referrals',
            'server_apps',
            'clients',
            'plans',
            'servers',
            'coupons',
            'whatsapp_templates',
            'bills_to_pay',
            'shared_panels',
            'client_categories',
            'external_apps',
            'custom_products',
            'monthly_profits',
            'chatbot_interactions',
            'chatbot_flow_sessions',
            'chatbot_flow_nodes',
            'chatbot_flows',
            'chatbot_contacts',
            'chatbot_rules',
            'chatbot_settings',
            'chatbot_template_categories',
            'chatbot_templates',
            'chatbot_send_logs',
            'whatsapp_seller_instances',
            'connection_logs',
            'connection_alerts',
            'user_roles',
            'profiles',
          ];

          for (const table of deleteOrder) {
            for (const sellerId of sellerIds) {
              const column = table === 'user_roles' ? 'user_id' : 
                            table === 'profiles' ? 'id' : 'seller_id';
              await supabase.from(table).delete().eq(column, sellerId);
            }
          }
        }

        // Limpar tabelas globais se aplicável
        if (shouldImport('default_server_icons')) {
          await supabase.from('default_server_icons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (shouldImport('app_settings')) {
          await supabase.from('app_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }

        console.log('Base limpa com sucesso');
      } catch (cleanError) {
        const errorMsg = cleanError instanceof Error ? cleanError.message : 'Erro desconhecido';
        const fullError = await saveJobError(errorMsg, 'cleanup');
        return new Response(
          JSON.stringify({ error: fullError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==========================================
    // 7. PROCESSAMENTO NA ORDEM EXATA
    // ==========================================
    for (const tableName of IMPORT_ORDER) {
      if (!shouldImport(tableName)) continue;
      
      const tableData = backup.data[tableName];
      if (!Array.isArray(tableData) || tableData.length === 0) continue;

      currentTable = tableName;
      console.log(`=== IMPORTANDO ${tableName.toUpperCase()} (${tableData.length}) ===`);

      try {
        switch (tableName) {
          // ----------------------------------------
          // 1. PROFILES
          // ----------------------------------------
          case 'profiles': {
            let count = 0;
            for (const profile of tableData) {
              const profileEmail = profile.email;
              if (!profileEmail) {
                results.warnings.push(`Perfil sem email, ignorando`);
                processedItems++;
                continue;
              }

              // Verificar se já existe
              const { data: existing } = await supabase
                .from('profiles')
                .select('id, email')
                .eq('email', profileEmail)
                .single();

              if (existing) {
                emailToSellerId.set(profileEmail, existing.id);
                sellerIdToEmail.set(existing.id, profileEmail);
                
                // Atualizar dados se não for o admin
                if (mode === 'replace' && existing.id !== userId) {
                  await supabase
                    .from('profiles')
                    .update({
                      full_name: profile.full_name,
                      whatsapp: profile.whatsapp,
                      company_name: profile.company_name,
                      pix_key: profile.pix_key,
                      is_active: profile.is_active,
                      is_permanent: profile.is_permanent,
                      subscription_expires_at: profile.subscription_expires_at,
                      notification_days_before: profile.notification_days_before,
                      tutorial_visto: profile.tutorial_visto,
                      needs_password_update: profile.needs_password_update,
                    })
                    .eq('id', existing.id);
                  count++;
                }
                processedItems++;
                continue;
              }

              // Criar novo usuário
              const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';
              const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: profileEmail,
                email_confirm: true,
                password: randomPassword,
                user_metadata: { full_name: profile.full_name, whatsapp: profile.whatsapp }
              });

              if (authError) {
                results.errors.push(`Usuário ${profileEmail}: ${authError.message}`);
                processedItems++;
                continue;
              }

              emailToSellerId.set(profileEmail, authUser.user.id);
              sellerIdToEmail.set(authUser.user.id, profileEmail);

              await supabase
                .from('profiles')
                .update({
                  company_name: profile.company_name,
                  pix_key: profile.pix_key,
                  is_active: profile.is_active,
                  is_permanent: profile.is_permanent,
                  subscription_expires_at: profile.subscription_expires_at,
                  notification_days_before: profile.notification_days_before,
                  tutorial_visto: profile.tutorial_visto,
                  needs_password_update: true,
                })
                .eq('id', authUser.user.id);

              count++;
              processedItems++;
            }
            results.restored.profiles = count;
            break;
          }

          // ----------------------------------------
          // 2. SERVERS
          // ----------------------------------------
          case 'servers': {
            const rows: any[] = [];
            let skipped = 0;
            
            for (const server of tableData) {
              const sellerEmail = getSellerEmail(server);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              
              if (!sellerId) { skipped++; continue; }
              
              rows.push({
                seller_id: sellerId,
                name: server.name,
                panel_url: server.panel_url,
                monthly_cost: server.monthly_cost || 0,
                is_credit_based: server.is_credit_based,
                total_credits: server.total_credits || 0,
                used_credits: server.used_credits || 0,
                credit_price: server.credit_price || 0,
                credit_value: server.credit_value || 0,
                iptv_per_credit: server.iptv_per_credit || 0,
                p2p_per_credit: server.p2p_per_credit || 0,
                total_screens_per_credit: server.total_screens_per_credit || 0,
                icon_url: server.icon_url,
                notes: server.notes,
                is_active: server.is_active !== false,
                _temp_email: sellerEmail,
                _temp_name: server.name,
              });
            }

            // Inserir e mapear
            for (const row of rows) {
              const tempEmail = row._temp_email;
              const tempName = row._temp_name;
              delete row._temp_email;
              delete row._temp_name;
              
              const { data: inserted, error } = await supabase
                .from('servers')
                .insert(row)
                .select('id')
                .single();
              
              if (!error && inserted) {
                serverNameToId.set(`${tempEmail}|${tempName}`, inserted.id);
              } else if (error) {
                results.errors.push(`Servidor "${tempName}": ${error.message}`);
              }
              processedItems++;
            }
            
            results.restored.servers = rows.length - results.errors.filter(e => e.includes('Servidor')).length;
            if (skipped > 0) results.skipped.servers = skipped;
            break;
          }

          // ----------------------------------------
          // 3. PLANS
          // ----------------------------------------
          case 'plans': {
            let count = 0, skipped = 0;
            
            for (const plan of tableData) {
              const sellerEmail = getSellerEmail(plan);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              
              if (!sellerId) { skipped++; processedItems++; continue; }
              
              const { data: inserted, error } = await supabase
                .from('plans')
                .insert({
                  seller_id: sellerId,
                  name: plan.name,
                  price: plan.price || 0,
                  duration_days: plan.duration_days || 30,
                  category: plan.category,
                  description: plan.description,
                  screens: plan.screens || 1,
                  is_active: plan.is_active !== false,
                })
                .select('id')
                .single();
              
              if (!error && inserted) {
                planNameToId.set(`${sellerEmail}|${plan.name}`, inserted.id);
                count++;
              } else if (error) {
                results.errors.push(`Plano "${plan.name}": ${error.message}`);
              }
              processedItems++;
            }
            
            results.restored.plans = count;
            if (skipped > 0) results.skipped.plans = skipped;
            break;
          }

          // ----------------------------------------
          // 4. CLIENTS
          // ----------------------------------------
          case 'clients': {
            let count = 0, skipped = 0;
            
            for (const client of tableData) {
              const sellerEmail = getSellerEmail(client);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              
              if (!sellerId) { skipped++; processedItems++; continue; }
              
              const planId = planNameToId.get(`${sellerEmail}|${client.plan_name}`);
              const serverId = serverNameToId.get(`${sellerEmail}|${client.server_name}`);
              const serverId2 = client.server_name_2 ? serverNameToId.get(`${sellerEmail}|${client.server_name_2}`) : null;
              
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
                  plan_price: client.plan_price || 0,
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
                  pending_amount: client.pending_amount || 0,
                  expected_payment_date: client.expected_payment_date,
                  additional_servers: client.additional_servers,
                  gerencia_app_mac: client.gerencia_app_mac,
                  gerencia_app_devices: client.gerencia_app_devices,
                  referral_code: client.referral_code,
                  is_archived: client.is_archived,
                })
                .select('id')
                .single();
              
              if (!error && inserted) {
                const identifier = client.email || client.phone || client.name;
                clientIdentifierToId.set(`${sellerEmail}|${identifier}`, inserted.id);
                count++;
              } else if (error) {
                results.errors.push(`Cliente "${client.name}": ${error.message}`);
              }
              processedItems++;
              
              if (processedItems % 50 === 0) await updateProgress();
            }
            
            results.restored.clients = count;
            if (skipped > 0) results.skipped.clients = skipped;
            break;
          }

          // ----------------------------------------
          // 5. COUPONS
          // ----------------------------------------
          case 'coupons': {
            let count = 0;
            for (const coupon of tableData) {
              const sellerEmail = getSellerEmail(coupon);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('coupons')
                .insert({
                  seller_id: sellerId,
                  code: coupon.code,
                  name: coupon.name,
                  discount_type: coupon.discount_type || 'fixed',
                  discount_value: coupon.discount_value || 0,
                  min_plan_value: coupon.min_plan_value,
                  max_uses: coupon.max_uses,
                  current_uses: coupon.current_uses || 0,
                  expires_at: coupon.expires_at,
                  is_active: coupon.is_active !== false,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.coupons = count;
            break;
          }

          // ----------------------------------------
          // 6. REFERRALS
          // ----------------------------------------
          case 'referrals': {
            let count = 0;
            for (const ref of tableData) {
              const sellerEmail = getSellerEmail(ref);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              const referrerId = clientIdentifierToId.get(`${sellerEmail}|${ref.referrer_identifier}`);
              const referredId = clientIdentifierToId.get(`${sellerEmail}|${ref.referred_identifier}`);
              
              if (!sellerId || !referrerId || !referredId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('referrals')
                .insert({
                  seller_id: sellerId,
                  referrer_client_id: referrerId,
                  referred_client_id: referredId,
                  discount_percentage: ref.discount_percentage || 0,
                  status: ref.status || 'pending',
                  completed_at: ref.completed_at,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.referrals = count;
            break;
          }

          // ----------------------------------------
          // 7. WHATSAPP_TEMPLATES
          // ----------------------------------------
          case 'whatsapp_templates': {
            let count = 0;
            for (const template of tableData) {
              const sellerEmail = getSellerEmail(template);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { data: inserted, error } = await supabase
                .from('whatsapp_templates')
                .insert({
                  seller_id: sellerId,
                  name: template.name,
                  type: template.type,
                  message: template.message,
                  is_default: template.is_default,
                })
                .select('id')
                .single();
              
              if (!error && inserted) {
                templateNameToId.set(`${sellerEmail}|${template.name}`, inserted.id);
                count++;
              }
              processedItems++;
            }
            results.restored.whatsapp_templates = count;
            break;
          }

          // ----------------------------------------
          // 8. BILLS_TO_PAY
          // ----------------------------------------
          case 'bills_to_pay': {
            let count = 0;
            for (const bill of tableData) {
              const sellerEmail = getSellerEmail(bill);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('bills_to_pay')
                .insert({
                  seller_id: sellerId,
                  description: bill.description,
                  amount: bill.amount || 0,
                  due_date: bill.due_date,
                  recipient_name: bill.recipient_name,
                  recipient_pix: bill.recipient_pix,
                  recipient_whatsapp: bill.recipient_whatsapp,
                  is_paid: bill.is_paid,
                  paid_at: bill.paid_at,
                  notes: bill.notes,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.bills_to_pay = count;
            break;
          }

          // ----------------------------------------
          // 9. SHARED_PANELS
          // ----------------------------------------
          case 'shared_panels': {
            let count = 0;
            for (const panel of tableData) {
              const sellerEmail = getSellerEmail(panel);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { data: inserted, error } = await supabase
                .from('shared_panels')
                .insert({
                  seller_id: sellerId,
                  name: panel.name,
                  panel_type: panel.panel_type || 'unified',
                  monthly_cost: panel.monthly_cost || 0,
                  total_slots: panel.total_slots || 0,
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
                  is_active: panel.is_active !== false,
                })
                .select('id')
                .single();
              
              if (!error && inserted) {
                panelNameToId.set(`${sellerEmail}|${panel.name}`, inserted.id);
                count++;
              }
              processedItems++;
            }
            results.restored.shared_panels = count;
            break;
          }

          // ----------------------------------------
          // 10. PANEL_CLIENTS
          // ----------------------------------------
          case 'panel_clients': {
            let count = 0;
            for (const pc of tableData) {
              const sellerEmail = getSellerEmail(pc);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              const clientId = clientIdentifierToId.get(`${sellerEmail}|${pc.client_identifier}`);
              const panelId = panelNameToId.get(`${sellerEmail}|${pc.panel_name}`);
              
              if (!sellerId || !clientId || !panelId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('panel_clients')
                .insert({
                  seller_id: sellerId,
                  client_id: clientId,
                  panel_id: panelId,
                  slot_type: pc.slot_type || 'unified',
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.panel_clients = count;
            break;
          }

          // ----------------------------------------
          // 11. MESSAGE_HISTORY (batch)
          // ----------------------------------------
          case 'message_history': {
            const rows: any[] = [];
            let skipped = 0;
            
            for (const msg of tableData) {
              const sellerEmail = getSellerEmail(msg);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              const clientId = clientIdentifierToId.get(`${sellerEmail}|${msg.client_identifier}`);
              const templateId = msg.template_name ? templateNameToId.get(`${sellerEmail}|${msg.template_name}`) : null;
              
              if (!sellerId || !clientId) { skipped++; continue; }
              
              rows.push({
                seller_id: sellerId,
                client_id: clientId,
                phone: msg.phone,
                message_type: msg.message_type || 'manual',
                message_content: msg.message_content,
                template_id: templateId,
                sent_at: msg.sent_at,
              });
            }
            
            const { inserted, errors } = await insertBatch('message_history', rows, { ignoreDuplicates: true });
            results.restored.message_history = inserted;
            if (skipped > 0) results.skipped.message_history = skipped;
            if (errors.length > 0) results.errors.push(...errors.slice(0, 10));
            break;
          }

          // ----------------------------------------
          // 12. CLIENT_CATEGORIES
          // ----------------------------------------
          case 'client_categories': {
            let count = 0;
            for (const cat of tableData) {
              const sellerEmail = getSellerEmail(cat);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('client_categories')
                .insert({ seller_id: sellerId, name: cat.name });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.client_categories = count;
            break;
          }

          // ----------------------------------------
          // 13. EXTERNAL_APPS
          // ----------------------------------------
          case 'external_apps': {
            let count = 0;
            for (const app of tableData) {
              const sellerEmail = getSellerEmail(app);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { data: inserted, error } = await supabase
                .from('external_apps')
                .insert({
                  seller_id: sellerId,
                  name: app.name,
                  auth_type: app.auth_type || 'email_password',
                  price: app.price || 0,
                  cost: app.cost || 0,
                  website_url: app.website_url,
                  download_url: app.download_url,
                  is_active: app.is_active !== false,
                })
                .select('id')
                .single();
              
              if (!error && inserted) {
                extAppNameToId.set(`${sellerEmail}|${app.name}`, inserted.id);
                count++;
              }
              processedItems++;
            }
            results.restored.external_apps = count;
            break;
          }

          // ----------------------------------------
          // 14. CLIENT_EXTERNAL_APPS
          // ----------------------------------------
          case 'client_external_apps': {
            let count = 0;
            for (const cea of tableData) {
              const sellerEmail = getSellerEmail(cea);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              const clientId = clientIdentifierToId.get(`${sellerEmail}|${cea.client_identifier}`);
              const appId = extAppNameToId.get(`${sellerEmail}|${cea.app_name}`);
              
              if (!sellerId || !clientId || !appId) { processedItems++; continue; }
              
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
              processedItems++;
            }
            results.restored.client_external_apps = count;
            break;
          }

          // ----------------------------------------
          // 15. CLIENT_PREMIUM_ACCOUNTS
          // ----------------------------------------
          case 'client_premium_accounts': {
            let count = 0;
            for (const cpa of tableData) {
              const sellerEmail = getSellerEmail(cpa);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              const clientId = clientIdentifierToId.get(`${sellerEmail}|${cpa.client_identifier}`);
              
              if (!sellerId || !clientId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('client_premium_accounts')
                .insert({
                  seller_id: sellerId,
                  client_id: clientId,
                  plan_name: cpa.plan_name,
                  email: cpa.email,
                  password: cpa.password,
                  price: cpa.price || 0,
                  expiration_date: cpa.expiration_date,
                  notes: cpa.notes,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.client_premium_accounts = count;
            break;
          }

          // ----------------------------------------
          // 16. CUSTOM_PRODUCTS
          // ----------------------------------------
          case 'custom_products': {
            let count = 0;
            for (const product of tableData) {
              const sellerEmail = getSellerEmail(product);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('custom_products')
                .insert({
                  seller_id: sellerId,
                  name: product.name,
                  icon: product.icon,
                  download_url: product.download_url,
                  downloader_code: product.downloader_code,
                  is_active: product.is_active !== false,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.custom_products = count;
            break;
          }

          // ----------------------------------------
          // 17. APP_SETTINGS
          // ----------------------------------------
          case 'app_settings': {
            let count = 0;
            for (const setting of tableData) {
              const { error } = await supabase
                .from('app_settings')
                .upsert({
                  key: setting.key,
                  value: setting.value,
                  description: setting.description,
                }, { onConflict: 'key' });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.app_settings = count;
            break;
          }

          // ----------------------------------------
          // 18. MONTHLY_PROFITS
          // ----------------------------------------
          case 'monthly_profits': {
            let count = 0;
            for (const profit of tableData) {
              const sellerEmail = getSellerEmail(profit);
              const sellerId = emailToSellerId.get(sellerEmail || '');
              if (!sellerId) { processedItems++; continue; }
              
              const { error } = await supabase
                .from('monthly_profits')
                .insert({
                  seller_id: sellerId,
                  month: profit.month,
                  year: profit.year,
                  revenue: profit.revenue || 0,
                  server_costs: profit.server_costs || 0,
                  bills_costs: profit.bills_costs || 0,
                  net_profit: profit.net_profit || 0,
                  active_clients: profit.active_clients || 0,
                  closed_at: profit.closed_at,
                });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.monthly_profits = count;
            break;
          }

          // ----------------------------------------
          // 19. DEFAULT_SERVER_ICONS
          // ----------------------------------------
          case 'default_server_icons': {
            let count = 0;
            for (const icon of tableData) {
              const { error } = await supabase
                .from('default_server_icons')
                .upsert({
                  name: icon.name,
                  name_normalized: icon.name_normalized || icon.name.toLowerCase().replace(/\s+/g, '_'),
                  icon_url: icon.icon_url,
                }, { onConflict: 'name_normalized' });
              
              if (!error) count++;
              processedItems++;
            }
            results.restored.default_server_icons = count;
            break;
          }
        }

        await updateProgress();
        console.log(`${tableName}: ${results.restored[tableName] || 0} restaurados`);
        
      } catch (tableError) {
        const errorMsg = tableError instanceof Error ? tableError.message : 'Erro desconhecido';
        const fullError = await saveJobError(errorMsg, tableName);
        console.error(`ERRO FATAL em ${tableName}:`, errorMsg);
        
        return new Response(
          JSON.stringify({ 
            error: fullError,
            table: tableName,
            restored_before_error: results.restored
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==========================================
    // 8. FINALIZAÇÃO
    // ==========================================
    // Remover contagens zero
    for (const key of Object.keys(results.restored)) {
      if (results.restored[key] === 0) delete results.restored[key];
    }

    // Atualizar job como concluído
    if (jobId) {
      await supabase
        .from('backup_import_jobs')
        .update({
          status: 'completed',
          progress: 100,
          processed_items: totalItems,
          restored: results.restored,
          warnings: results.warnings,
          errors: results.errors,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    console.log('=== RESTORE CONCLUÍDO COM SUCESSO ===');
    console.log('Restaurados:', JSON.stringify(results.restored));
    console.log('Erros:', results.errors.length);
    console.log('Avisos:', results.warnings.length);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Restore concluído com sucesso',
        restored: results.restored,
        errors: results.errors,
        warnings: results.warnings,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('=== ERRO FATAL NO IMPORT ===', errorMessage);
    console.error('Tabela atual:', currentTable);
    
    await saveJobError(errorMessage, currentTable || undefined);
    
    return new Response(
      JSON.stringify({ 
        error: `Erro fatal: ${errorMessage}`,
        table: currentTable,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
