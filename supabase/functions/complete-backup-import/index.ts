import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// CONFIGURAÇÃO
// ============================================
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BATCH_SIZE = 100;

// Ordem obrigatória de importação (respeitando FKs)
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
  'server_apps',
] as const;

// ============================================
// TIPOS
// ============================================
interface ImportReport {
  status: 'success' | 'partial_success' | 'failed';
  phase: string;
  startTime: number;
  endTime?: number;
  totalTimeMs?: number;
  stats: {
    expected: Record<string, number>;
    imported: Record<string, number>;
    skipped: Record<string, number>;
    errors: Record<string, number>;
  };
  errorDetails: Array<{
    table: string;
    index: number;
    field?: string;
    reason: string;
  }>;
  warnings: string[];
  mappings: {
    profiles: number;
    servers: number;
    plans: number;
    clients: number;
  };
}

interface IndexMaps {
  emailToSellerId: Map<string, string>;
  serverKeyToId: Map<string, string>;  // "email|name" -> id
  planKeyToId: Map<string, string>;    // "email|name" -> id
  clientKeyToId: Map<string, string>;  // "email|identifier" -> id
  templateKeyToId: Map<string, string>;
  panelKeyToId: Map<string, string>;
  extAppKeyToId: Map<string, string>;
}

// ============================================
// SERVE
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let jobId: string | null = null;
  const report: ImportReport = {
    status: 'failed',
    phase: 'init',
    startTime: Date.now(),
    stats: { expected: {}, imported: {}, skipped: {}, errors: {} },
    errorDetails: [],
    warnings: [],
    mappings: { profiles: 0, servers: 0, plans: 0, clients: 0 },
  };

  // ============================================
  // HELPERS
  // ============================================
  const updateJob = async (updates: Record<string, any>) => {
    if (!jobId) return;
    try {
      await supabase
        .from('backup_import_jobs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    } catch (e) {
      console.error('Failed to update job:', e);
    }
  };

  const logError = (table: string, index: number, reason: string, field?: string) => {
    report.errorDetails.push({ table, index, field, reason });
    report.stats.errors[table] = (report.stats.errors[table] || 0) + 1;
    console.error(`[${table}][${index}]${field ? `[${field}]` : ''}: ${reason}`);
  };

  const chunkArray = <T>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  try {
    console.log('=== ADVANCED BACKUP IMPORT V6 ===');
    console.log(`Max file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    console.log(`Batch size: ${BATCH_SIZE}`);

    // ============================================
    // FASE 0: AUTENTICAÇÃO
    // ============================================
    report.phase = 'authentication';
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Sessão expirada. Faça login novamente.', report }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada.', report }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminUserId = userData.user.id;
    const adminEmail = userData.user.email;
    console.log(`Admin: ${adminEmail} (${adminUserId})`);

    // Verificar role admin
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUserId);

    const hasAdminRole = Array.isArray(roleRows) && roleRows.some((r: any) => r?.role === 'admin');
    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores.', report }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // FASE 1: LEITURA E VALIDAÇÃO DO ARQUIVO
    // ============================================
    report.phase = 'reading';
    console.log('=== FASE 1: Leitura do arquivo ===');

    // Ler corpo completo como texto
    let rawBody: string;
    try {
      const contentLength = parseInt(req.headers.get('content-length') || '0');
      console.log(`Content-Length header: ${contentLength} bytes`);
      
      if (contentLength > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ 
            error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
            report 
          }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      rawBody = await req.text();
      console.log(`Raw body length: ${rawBody.length} chars`);
    } catch (readError) {
      const msg = readError instanceof Error ? readError.message : 'Erro desconhecido';
      return new Response(
        JSON.stringify({ error: `Falha na leitura do arquivo: ${msg}`, report }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON com validação
    report.phase = 'parsing';
    console.log('=== FASE 1.1: Parse JSON ===');
    
    let requestBody: any;
    try {
      // Validação estrutural prévia - verificar se JSON fecha corretamente
      const trimmed = rawBody.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        throw new Error('JSON incompleto ou truncado - não começa/termina com {}');
      }
      
      requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : 'Erro de sintaxe';
      // Tentar extrair posição do erro
      const posMatch = msg.match(/position (\d+)/);
      const position = posMatch ? parseInt(posMatch[1]) : null;
      
      return new Response(
        JSON.stringify({ 
          error: `JSON inválido: ${msg}${position ? ` (posição ${position})` : ''}`,
          report 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Liberar memória do raw body
    rawBody = '';

    const { backup, mode, modules, jobId: receivedJobId } = requestBody;
    jobId = receivedJobId;

    // ============================================
    // FASE 1.2: VALIDAÇÃO DO FORMATO
    // ============================================
    report.phase = 'validation';
    console.log('=== FASE 1.2: Validação do formato ===');

    // Campos obrigatórios
    if (!backup) {
      return new Response(
        JSON.stringify({ error: 'Campo "backup" não encontrado no request.', report }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const version = backup.version || '';
    const format = backup.format || '';
    
    if (!version) {
      report.warnings.push('Campo "version" ausente no backup');
    }
    if (!format) {
      report.warnings.push('Campo "format" ausente no backup');
    }
    if (!backup.data || typeof backup.data !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Campo "data" ausente ou inválido no backup.', report }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar versão compatível
    const isValidVersion = version.includes('3.0') || format === 'clean-logical-keys';
    if (!isValidVersion) {
      report.warnings.push(`Versão "${version}" pode não ser totalmente compatível`);
    }

    console.log(`Version: ${version}, Format: ${format}`);
    console.log(`Data keys: ${Object.keys(backup.data).join(', ')}`);

    // Coletar stats esperados
    const backupStats = backup.stats || {};
    for (const [key, value] of Object.entries(backup.data)) {
      if (Array.isArray(value)) {
        report.stats.expected[key] = value.length;
      }
    }
    console.log('Expected stats:', report.stats.expected);

    // Verificar se há dados
    const hasData = Object.values(backup.data).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    if (!hasData) {
      return new Response(
        JSON.stringify({ error: 'Backup vazio - nenhum dado para importar.', report }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // FASE 1.3: INDEXAÇÃO PRÉVIA
    // ============================================
    report.phase = 'indexing';
    console.log('=== FASE 1.3: Criação de índices ===');

    const maps: IndexMaps = {
      emailToSellerId: new Map(),
      serverKeyToId: new Map(),
      planKeyToId: new Map(),
      clientKeyToId: new Map(),
      templateKeyToId: new Map(),
      panelKeyToId: new Map(),
      extAppKeyToId: new Map(),
    };

    // Pré-mapear admin atual
    if (adminEmail) {
      maps.emailToSellerId.set(adminEmail, adminUserId);
    }

    // Criar índices temporários dos dados do backup para referência cruzada
    const profilesByEmail = new Map<string, any>();
    for (const profile of (backup.data.profiles || [])) {
      if (profile.email) {
        profilesByEmail.set(profile.email, profile);
      }
    }
    console.log(`Indexed ${profilesByEmail.size} profiles by email`);

    // Calcular total de itens
    let totalItems = 0;
    for (const key of Object.keys(backup.data)) {
      const arr = backup.data[key];
      if (Array.isArray(arr)) totalItems += arr.length;
    }
    let processedItems = 0;

    // Atualizar job
    await updateJob({
      status: 'processing',
      progress: 5,
      total_items: totalItems,
      processed_items: 0,
    });

    // Helper para verificar módulo
    const shouldImport = (name: string): boolean => {
      if (!modules || modules.length === 0) return true;
      return modules.includes(name);
    };

    // Helper para obter seller email
    const getSellerEmail = (item: any): string | null => {
      return item._seller_email || item.seller_email || item.email || null;
    };

    // Helper para obter seller_id
    const getSellerId = (item: any): string | null => {
      const email = getSellerEmail(item);
      if (email) {
        return maps.emailToSellerId.get(email) || null;
      }
      return null;
    };

    // ============================================
    // FASE 2: LIMPEZA (modo replace)
    // ============================================
    if (mode === 'replace') {
      report.phase = 'cleanup';
      console.log('=== FASE 2: Limpeza de dados existentes ===');

      try {
        const backupEmails = new Set(
          (backup.data.profiles || []).map((p: any) => p.email).filter(Boolean)
        );

        // Buscar sellers existentes
        const { data: existingProfiles } = await supabase
          .from('profiles')
          .select('id, email');

        const sellersToClean = (existingProfiles || [])
          .filter((p: any) => backupEmails.has(p.email) || p.id === adminUserId)
          .map((p: any) => p.id);

        console.log(`Cleaning data for ${sellersToClean.length} sellers`);

        // Ordem de deleção (respeita FKs)
        const deleteTables = [
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
        ];

        for (const table of deleteTables) {
          for (const sellerId of sellersToClean) {
            await supabase.from(table).delete().eq('seller_id', sellerId);
          }
        }

        // Tabelas globais
        if (shouldImport('default_server_icons')) {
          await supabase.from('default_server_icons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (shouldImport('app_settings')) {
          await supabase.from('app_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }

        console.log('Cleanup completed');
      } catch (cleanError) {
        report.warnings.push(`Erro na limpeza: ${cleanError instanceof Error ? cleanError.message : 'desconhecido'}`);
      }
    }

    await updateJob({ progress: 10 });

    // ============================================
    // FASE 3: IMPORTAÇÃO PRINCIPAL
    // ============================================
    report.phase = 'importing';
    console.log('=== FASE 3: Importação principal ===');

    // ----------------------------------------
    // 1. PROFILES
    // ----------------------------------------
    if (shouldImport('profiles')) {
      const tableData = backup.data.profiles || [];
      if (tableData.length > 0) {
        console.log(`\n[PROFILES] Importing ${tableData.length} records...`);
        let imported = 0, skipped = 0;

        for (let i = 0; i < tableData.length; i++) {
          const profile = tableData[i];
          
          if (!profile.email) {
            logError('profiles', i, 'Email ausente');
            skipped++;
            continue;
          }

          try {
            // Verificar se existe
            const { data: existing } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', profile.email)
              .single();

            if (existing) {
              maps.emailToSellerId.set(profile.email, existing.id);
              
              if (mode === 'replace') {
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
                    tutorial_visto: profile.tutorial_visto,
                  })
                  .eq('id', existing.id);
                imported++;
              } else {
                skipped++;
              }
            } else {
              // Criar novo usuário
              const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';
              const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: profile.email,
                email_confirm: true,
                password: randomPassword,
                user_metadata: { full_name: profile.full_name }
              });

              if (authError) {
                logError('profiles', i, authError.message, 'auth');
                skipped++;
                continue;
              }

              maps.emailToSellerId.set(profile.email, authUser.user.id);

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
                  tutorial_visto: profile.tutorial_visto,
                  needs_password_update: true,
                })
                .eq('id', authUser.user.id);

              imported++;
            }
          } catch (err) {
            logError('profiles', i, err instanceof Error ? err.message : 'Erro desconhecido');
            skipped++;
          }

          processedItems++;
        }

        report.stats.imported.profiles = imported;
        report.stats.skipped.profiles = skipped;
        report.mappings.profiles = maps.emailToSellerId.size;
        console.log(`[PROFILES] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    await updateJob({ progress: 20, restored: report.stats.imported });

    // ----------------------------------------
    // 2. SERVERS (batch)
    // ----------------------------------------
    if (shouldImport('servers')) {
      const tableData: any[] = backup.data.servers || [];
      if (tableData.length > 0) {
        console.log(`\n[SERVERS] Importing ${tableData.length} records...`);
        let imported = 0, skipped = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          const rows: any[] = [];
          
          for (let i = 0; i < chunk.length; i++) {
            const server: any = chunk[i];
            const sellerEmail = getSellerEmail(server);
            const sellerId = getSellerId(server);

            if (!sellerId) {
              logError('servers', i, `Seller não encontrado: ${sellerEmail}`, '_seller_email');
              skipped++;
              continue;
            }

            rows.push({
              seller_id: sellerId,
              name: server.name,
              panel_url: server.panel_url,
              monthly_cost: server.monthly_cost || 0,
              is_credit_based: server.is_credit_based ?? false,
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

          if (rows.length > 0) {
            const insertRows = rows.map((r: any) => {
              const { _temp_email, _temp_name, ...rest } = r;
              return rest;
            });

            const { data: inserted, error } = await supabase
              .from('servers')
              .insert(insertRows)
              .select('id, name, seller_id');

            if (error) {
              for (let j = 0; j < rows.length; j++) {
                const { _temp_email, _temp_name, ...row } = rows[j];
                const { data: single, error: singleErr } = await supabase
                  .from('servers')
                  .insert(row)
                  .select('id')
                  .single();

                if (!singleErr && single) {
                  maps.serverKeyToId.set(`${_temp_email}|${_temp_name}`, single.id);
                  imported++;
                } else {
                  logError('servers', j, singleErr?.message || 'Erro inserção');
                  skipped++;
                }
              }
            } else if (inserted) {
              for (let j = 0; j < inserted.length; j++) {
                const email = rows[j]._temp_email;
                const name = rows[j]._temp_name;
                maps.serverKeyToId.set(`${email}|${name}`, inserted[j].id);
                imported++;
              }
            }
          }

          processedItems += chunk.length;
        }

        report.stats.imported.servers = imported;
        report.stats.skipped.servers = skipped;
        report.mappings.servers = maps.serverKeyToId.size;
        console.log(`[SERVERS] Done: ${imported} imported, ${skipped} skipped, ${maps.serverKeyToId.size} mapped`);
      }
    }

    await updateJob({ progress: 30, restored: report.stats.imported });

    // ----------------------------------------
    // 3. PLANS (batch)
    // ----------------------------------------
    if (shouldImport('plans')) {
      const tableData: any[] = backup.data.plans || [];
      if (tableData.length > 0) {
        console.log(`\n[PLANS] Importing ${tableData.length} records...`);
        let imported = 0, skipped = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          const rows: any[] = [];

          for (let i = 0; i < chunk.length; i++) {
            const plan: any = chunk[i];
            const sellerEmail = getSellerEmail(plan);
            const sellerId = getSellerId(plan);

            if (!sellerId) {
              skipped++;
              continue;
            }

            rows.push({
              seller_id: sellerId,
              name: plan.name,
              price: plan.price || 0,
              duration_days: plan.duration_days || 30,
              category: plan.category,
              description: plan.description,
              screens: plan.screens || 1,
              is_active: plan.is_active !== false,
              _temp_email: sellerEmail,
              _temp_name: plan.name,
            });
          }

          if (rows.length > 0) {
            const insertRows = rows.map((r: any) => {
              const { _temp_email, _temp_name, ...rest } = r;
              return rest;
            });

            const { data: inserted, error } = await supabase
              .from('plans')
              .insert(insertRows)
              .select('id');

            if (error) {
              for (let j = 0; j < rows.length; j++) {
                const { _temp_email, _temp_name, ...row } = rows[j];
                const { data: single, error: singleErr } = await supabase
                  .from('plans')
                  .insert(row)
                  .select('id')
                  .single();

                if (!singleErr && single) {
                  maps.planKeyToId.set(`${_temp_email}|${_temp_name}`, single.id);
                  imported++;
                } else {
                  skipped++;
                }
              }
            } else if (inserted) {
              for (let j = 0; j < inserted.length; j++) {
                maps.planKeyToId.set(`${rows[j]._temp_email}|${rows[j]._temp_name}`, inserted[j].id);
                imported++;
              }
            }
          }

          processedItems += chunk.length;
        }

        report.stats.imported.plans = imported;
        report.stats.skipped.plans = skipped;
        report.mappings.plans = maps.planKeyToId.size;
        console.log(`[PLANS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    await updateJob({ progress: 40, restored: report.stats.imported });

    // ----------------------------------------
    // 4. CLIENTS (batch)
    // ----------------------------------------
    if (shouldImport('clients')) {
      const tableData: any[] = backup.data.clients || [];
      if (tableData.length > 0) {
        console.log(`\n[CLIENTS] Importing ${tableData.length} records...`);
        let imported = 0, skipped = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          const rows: any[] = [];

          for (let i = 0; i < chunk.length; i++) {
            const client: any = chunk[i];
            const sellerEmail = getSellerEmail(client);
            const sellerId = getSellerId(client);

            if (!sellerId) {
              logError('clients', i, `Seller não encontrado: ${sellerEmail}`);
              skipped++;
              continue;
            }

            let serverId = null, planId = null, serverId2 = null;

            if (client.server_name) {
              serverId = maps.serverKeyToId.get(`${sellerEmail}|${client.server_name}`);
            }
            if (client.plan_name) {
              planId = maps.planKeyToId.get(`${sellerEmail}|${client.plan_name}`);
            }
            if (client.server_name_2) {
              serverId2 = maps.serverKeyToId.get(`${sellerEmail}|${client.server_name_2}`);
            }

            const identifier = client._identifier || client.email || client.phone || client.name;

            rows.push({
              seller_id: sellerId,
              name: client.name,
              phone: client.phone,
              email: client.email,
              login: client.login,
              password: client.password,
              login_2: client.login_2,
              password_2: client.password_2,
              plan_id: planId,
              plan_name: client.plan_name,
              plan_price: client.plan_price || 0,
              server_id: serverId,
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
              renewed_at: client.renewed_at,
              archived_at: client.archived_at,
              credentials_fingerprint: client.credentials_fingerprint,
              has_paid_apps: client.has_paid_apps,
              paid_apps_email: client.paid_apps_email,
              paid_apps_password: client.paid_apps_password,
              paid_apps_expiration: client.paid_apps_expiration,
              paid_apps_duration: client.paid_apps_duration,
              premium_password: client.premium_password,
              premium_price: client.premium_price,
              _temp_email: sellerEmail,
              _temp_identifier: identifier,
            });
          }

          if (rows.length > 0) {
            const insertRows = rows.map((r: any) => {
              const { _temp_email, _temp_identifier, ...rest } = r;
              return rest;
            });

            const { data: inserted, error } = await supabase
              .from('clients')
              .insert(insertRows)
              .select('id');

            if (error) {
              for (let j = 0; j < rows.length; j++) {
                const { _temp_email, _temp_identifier, ...row } = rows[j];
                const { data: single, error: singleErr } = await supabase
                  .from('clients')
                  .insert(row)
                  .select('id')
                  .single();

                if (!singleErr && single) {
                  maps.clientKeyToId.set(`${_temp_email}|${_temp_identifier}`, single.id);
                  imported++;
                } else {
                  logError('clients', j, singleErr?.message || 'Erro');
                  skipped++;
                }
              }
            } else if (inserted) {
              for (let j = 0; j < inserted.length; j++) {
                maps.clientKeyToId.set(`${rows[j]._temp_email}|${rows[j]._temp_identifier}`, inserted[j].id);
                imported++;
              }
            }
          }

          processedItems += chunk.length;
          await updateJob({ progress: 40 + Math.round((processedItems / totalItems) * 20), restored: report.stats.imported });
        }

        report.stats.imported.clients = imported;
        report.stats.skipped.clients = skipped;
        report.mappings.clients = maps.clientKeyToId.size;
        console.log(`[CLIENTS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    await updateJob({ progress: 60, restored: report.stats.imported });

    // ----------------------------------------
    // 5. SIMPLE TABLES (sem FKs complexas)
    // ----------------------------------------
    const simpleTables = [
      { name: 'coupons', fields: ['code', 'name', 'discount_type', 'discount_value', 'min_plan_value', 'max_uses', 'current_uses', 'expires_at', 'is_active'] },
      { name: 'whatsapp_templates', fields: ['name', 'type', 'message', 'is_default'], needsMapping: true, mapTo: 'templateKeyToId' },
      { name: 'bills_to_pay', fields: ['description', 'amount', 'due_date', 'recipient_name', 'recipient_pix', 'recipient_whatsapp', 'is_paid', 'paid_at', 'notes'] },
      { name: 'shared_panels', fields: ['name', 'panel_type', 'monthly_cost', 'total_slots', 'used_slots', 'used_iptv_slots', 'used_p2p_slots', 'url', 'login', 'password', 'expires_at', 'iptv_per_credit', 'p2p_per_credit', 'notes', 'is_active'], needsMapping: true, mapTo: 'panelKeyToId' },
      { name: 'client_categories', fields: ['name'] },
      { name: 'external_apps', fields: ['name', 'auth_type', 'price', 'cost', 'website_url', 'download_url', 'is_active'], needsMapping: true, mapTo: 'extAppKeyToId' },
      { name: 'custom_products', fields: ['name', 'icon', 'download_url', 'downloader_code', 'is_active'] },
      { name: 'monthly_profits', fields: ['month', 'year', 'revenue', 'server_costs', 'bills_costs', 'net_profit', 'active_clients', 'closed_at'] },
    ];

    for (const tableConfig of simpleTables) {
      if (!shouldImport(tableConfig.name)) continue;
      
      const tableData: any[] = backup.data[tableConfig.name] || [];
      if (tableData.length === 0) continue;

      console.log(`\n[${tableConfig.name.toUpperCase()}] Importing ${tableData.length} records...`);
      let imported = 0, skipped = 0;

      for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
        const rows: any[] = [];

        for (const item of chunk) {
          const itemAny = item as any;
          const sellerEmail = getSellerEmail(itemAny);
          const sellerId = getSellerId(itemAny);

          if (!sellerId) {
            skipped++;
            continue;
          }

          const row: any = { seller_id: sellerId };
          for (const field of tableConfig.fields) {
            if (itemAny[field] !== undefined) {
              row[field] = itemAny[field];
            }
          }

          if (tableConfig.needsMapping) {
            row._temp_email = sellerEmail;
            row._temp_name = itemAny.name;
          }

          rows.push(row);
        }

        if (rows.length > 0) {
          const insertRows = rows.map(r => {
            const { _temp_email, _temp_name, ...rest } = r;
            return rest;
          });

          const { data: inserted, error } = await supabase
            .from(tableConfig.name)
            .insert(insertRows)
            .select('id');

          if (!error && inserted) {
            imported += inserted.length;
            
            if (tableConfig.needsMapping && tableConfig.mapTo) {
              for (let j = 0; j < inserted.length; j++) {
                const mapKey = `${rows[j]._temp_email}|${rows[j]._temp_name}`;
                (maps as any)[tableConfig.mapTo].set(mapKey, inserted[j].id);
              }
            }
          } else if (error) {
            // Row-by-row fallback
            for (const row of rows) {
              const { _temp_email, _temp_name, ...r } = row;
              const { data: single, error: sErr } = await supabase
                .from(tableConfig.name)
                .insert(r)
                .select('id')
                .single();
              
              if (!sErr && single) {
                imported++;
                if (tableConfig.needsMapping && tableConfig.mapTo) {
                  (maps as any)[tableConfig.mapTo].set(`${_temp_email}|${_temp_name}`, single.id);
                }
              } else {
                skipped++;
              }
            }
          }
        }

        processedItems += chunk.length;
      }

      report.stats.imported[tableConfig.name] = imported;
      report.stats.skipped[tableConfig.name] = skipped;
      console.log(`[${tableConfig.name.toUpperCase()}] Done: ${imported} imported, ${skipped} skipped`);
    }

    await updateJob({ progress: 75, restored: report.stats.imported });

    // ----------------------------------------
    // 6. RELATIONAL TABLES (com FKs) - BATCH PROCESSING
    // ----------------------------------------
    
    // REFERRALS (batch processing with progress)
    if (shouldImport('referrals')) {
      const tableData: any[] = backup.data.referrals || [];
      if (tableData.length > 0) {
        console.log(`\n[REFERRALS] Importing ${tableData.length} records in batches of ${BATCH_SIZE}...`);
        let imported = 0, skipped = 0;
        let batchNumber = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          batchNumber++;
          const rows: any[] = [];

          for (const refItem of chunk) {
            const ref = refItem as any;
            const sellerEmail = getSellerEmail(ref);
            const sellerId = getSellerId(ref);
            if (!sellerId) { skipped++; continue; }

            const referrerId = ref._referrer_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${ref._referrer_identifier}`) : null;
            const referredId = ref._referred_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${ref._referred_identifier}`) : null;

            if (!referrerId || !referredId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              referrer_client_id: referrerId,
              referred_client_id: referredId,
              discount_percentage: ref.discount_percentage || 0,
              status: ref.status || 'active',
              completed_at: ref.completed_at,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('referrals').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              // Fallback: row-by-row
              for (const row of rows) {
                const { error: sErr } = await supabase.from('referrals').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
          
          // Progress update every batch
          const progressPercent = 75 + Math.round((processedItems / totalItems) * 10);
          await updateJob({ 
            progress: progressPercent, 
            processed_items: processedItems,
            restored: report.stats.imported 
          });
          
          console.log(`[REFERRALS] Batch ${batchNumber}: ${rows.length} processed, progress ${progressPercent}%`);
        }

        report.stats.imported.referrals = imported;
        report.stats.skipped.referrals = skipped;
        console.log(`[REFERRALS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    // PANEL_CLIENTS (batch processing with progress)
    if (shouldImport('panel_clients')) {
      const tableData: any[] = backup.data.panel_clients || [];
      if (tableData.length > 0) {
        console.log(`\n[PANEL_CLIENTS] Importing ${tableData.length} records in batches of ${BATCH_SIZE}...`);
        let imported = 0, skipped = 0;
        let batchNumber = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          batchNumber++;
          const rows: any[] = [];

          for (const pcItem of chunk) {
            const pc = pcItem as any;
            const sellerEmail = getSellerEmail(pc);
            const sellerId = getSellerId(pc);
            if (!sellerId) { skipped++; continue; }

            const clientId = pc._client_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${pc._client_identifier}`) : null;
            const panelId = pc._panel_name ? maps.panelKeyToId.get(`${sellerEmail}|${pc._panel_name}`) : null;

            if (!clientId || !panelId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              client_id: clientId,
              panel_id: panelId,
              slot_type: pc.slot_type || 'iptv',
              assigned_at: pc.assigned_at,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('panel_clients').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              // Fallback: row-by-row
              for (const row of rows) {
                const { error: sErr } = await supabase.from('panel_clients').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
          
          // Progress update every batch
          const progressPercent = 75 + Math.round((processedItems / totalItems) * 10);
          await updateJob({ 
            progress: progressPercent, 
            processed_items: processedItems,
            restored: report.stats.imported 
          });
          
          console.log(`[PANEL_CLIENTS] Batch ${batchNumber}: ${rows.length} processed, progress ${progressPercent}%`);
        }

        report.stats.imported.panel_clients = imported;
        report.stats.skipped.panel_clients = skipped;
        console.log(`[PANEL_CLIENTS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    // MESSAGE_HISTORY
    if (shouldImport('message_history')) {
      const tableData: any[] = backup.data.message_history || [];
      if (tableData.length > 0) {
        console.log(`\n[MESSAGE_HISTORY] Importing ${tableData.length} records...`);
        let imported = 0, skipped = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          const rows: any[] = [];

          for (const msg of chunk) {
            const msgAny = msg as any;
            const sellerEmail = getSellerEmail(msgAny);
            const sellerId = getSellerId(msgAny);
            if (!sellerId) { skipped++; continue; }

            const clientId = msgAny._client_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${msgAny._client_identifier}`) : null;
            const templateId = msgAny._template_name ? maps.templateKeyToId.get(`${sellerEmail}|${msgAny._template_name}`) : null;

            if (!clientId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              client_id: clientId,
              phone: msgAny.phone,
              message_type: msgAny.message_type || 'manual',
              message_content: msgAny.message_content,
              template_id: templateId,
              sent_at: msgAny.sent_at,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('message_history').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              for (const row of rows) {
                const { error: sErr } = await supabase.from('message_history').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
        }

        report.stats.imported.message_history = imported;
        report.stats.skipped.message_history = skipped;
      }
    }

    // CLIENT_EXTERNAL_APPS (batch processing with progress)
    if (shouldImport('client_external_apps')) {
      const tableData: any[] = backup.data.client_external_apps || [];
      if (tableData.length > 0) {
        console.log(`\n[CLIENT_EXTERNAL_APPS] Importing ${tableData.length} records in batches of ${BATCH_SIZE}...`);
        let imported = 0, skipped = 0;
        let batchNumber = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          batchNumber++;
          const rows: any[] = [];

          for (const appItem of chunk) {
            const app = appItem as any;
            const sellerEmail = getSellerEmail(app);
            const sellerId = getSellerId(app);
            if (!sellerId) { skipped++; continue; }

            const clientId = app._client_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${app._client_identifier}`) : null;
            const extAppId = app._app_name ? maps.extAppKeyToId.get(`${sellerEmail}|${app._app_name}`) : null;

            if (!clientId || !extAppId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              client_id: clientId,
              external_app_id: extAppId,
              email: app.email,
              password: app.password,
              expiration_date: app.expiration_date,
              devices: app.devices,
              notes: app.notes,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('client_external_apps').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              // Fallback: row-by-row
              for (const row of rows) {
                const { error: sErr } = await supabase.from('client_external_apps').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
          
          const progressPercent = 85 + Math.round((processedItems / totalItems) * 5);
          await updateJob({ 
            progress: progressPercent, 
            processed_items: processedItems,
            restored: report.stats.imported 
          });
          
          console.log(`[CLIENT_EXTERNAL_APPS] Batch ${batchNumber}: ${rows.length} processed, progress ${progressPercent}%`);
        }

        report.stats.imported.client_external_apps = imported;
        report.stats.skipped.client_external_apps = skipped;
        console.log(`[CLIENT_EXTERNAL_APPS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    // CLIENT_PREMIUM_ACCOUNTS (batch processing with progress)
    if (shouldImport('client_premium_accounts')) {
      const tableData: any[] = backup.data.client_premium_accounts || [];
      if (tableData.length > 0) {
        console.log(`\n[CLIENT_PREMIUM_ACCOUNTS] Importing ${tableData.length} records in batches of ${BATCH_SIZE}...`);
        let imported = 0, skipped = 0;
        let batchNumber = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          batchNumber++;
          const rows: any[] = [];

          for (const accItem of chunk) {
            const acc = accItem as any;
            const sellerEmail = getSellerEmail(acc);
            const sellerId = getSellerId(acc);
            if (!sellerId) { skipped++; continue; }

            const clientId = acc._client_identifier ? maps.clientKeyToId.get(`${sellerEmail}|${acc._client_identifier}`) : null;
            if (!clientId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              client_id: clientId,
              plan_name: acc.plan_name,
              email: acc.email,
              password: acc.password,
              price: acc.price || 0,
              expiration_date: acc.expiration_date,
              notes: acc.notes,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('client_premium_accounts').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              // Fallback: row-by-row
              for (const row of rows) {
                const { error: sErr } = await supabase.from('client_premium_accounts').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
          
          const progressPercent = 85 + Math.round((processedItems / totalItems) * 5);
          await updateJob({ 
            progress: progressPercent, 
            processed_items: processedItems,
            restored: report.stats.imported 
          });
          
          console.log(`[CLIENT_PREMIUM_ACCOUNTS] Batch ${batchNumber}: ${rows.length} processed, progress ${progressPercent}%`);
        }

        report.stats.imported.client_premium_accounts = imported;
        report.stats.skipped.client_premium_accounts = skipped;
        console.log(`[CLIENT_PREMIUM_ACCOUNTS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    // SERVER_APPS (batch processing with progress)
    if (shouldImport('server_apps')) {
      const tableData: any[] = backup.data.server_apps || [];
      if (tableData.length > 0) {
        console.log(`\n[SERVER_APPS] Importing ${tableData.length} records in batches of ${BATCH_SIZE}...`);
        let imported = 0, skipped = 0;
        let batchNumber = 0;

        for (const chunk of chunkArray(tableData, BATCH_SIZE)) {
          batchNumber++;
          const rows: any[] = [];

          for (const appItem of chunk) {
            const app = appItem as any;
            const sellerEmail = getSellerEmail(app);
            const sellerId = getSellerId(app);
            if (!sellerId) { skipped++; continue; }

            const serverId = app._server_name ? maps.serverKeyToId.get(`${sellerEmail}|${app._server_name}`) : null;
            if (!serverId) { skipped++; continue; }

            rows.push({
              seller_id: sellerId,
              server_id: serverId,
              name: app.name,
              app_type: app.app_type || 'iptv',
              download_url: app.download_url,
              downloader_code: app.downloader_code,
              website_url: app.website_url,
              icon: app.icon,
              notes: app.notes,
              is_active: app.is_active !== false,
            });
          }

          if (rows.length > 0) {
            const { data, error } = await supabase.from('server_apps').insert(rows).select('id');
            if (!error && data) {
              imported += data.length;
            } else {
              // Fallback: row-by-row
              for (const row of rows) {
                const { error: sErr } = await supabase.from('server_apps').insert(row);
                if (!sErr) imported++; else skipped++;
              }
            }
          }

          processedItems += chunk.length;
          
          const progressPercent = 85 + Math.round((processedItems / totalItems) * 5);
          await updateJob({ 
            progress: progressPercent, 
            processed_items: processedItems,
            restored: report.stats.imported 
          });
          
          console.log(`[SERVER_APPS] Batch ${batchNumber}: ${rows.length} processed, progress ${progressPercent}%`);
        }

        report.stats.imported.server_apps = imported;
        report.stats.skipped.server_apps = skipped;
        console.log(`[SERVER_APPS] Done: ${imported} imported, ${skipped} skipped`);
      }
    }

    await updateJob({ progress: 90, restored: report.stats.imported });

    // ----------------------------------------
    // 7. GLOBAL TABLES
    // ----------------------------------------
    
    // APP_SETTINGS
    if (shouldImport('app_settings')) {
      const tableData = backup.data.app_settings || [];
      if (tableData.length > 0) {
        console.log(`\n[APP_SETTINGS] Importing ${tableData.length} records...`);
        let imported = 0;

        for (const setting of tableData) {
          const { error } = await supabase
            .from('app_settings')
            .upsert({ key: setting.key, value: setting.value, description: setting.description }, { onConflict: 'key' });

          if (!error) imported++;
          processedItems++;
        }

        report.stats.imported.app_settings = imported;
      }
    }

    // DEFAULT_SERVER_ICONS
    if (shouldImport('default_server_icons')) {
      const tableData = backup.data.default_server_icons || [];
      if (tableData.length > 0) {
        console.log(`\n[DEFAULT_SERVER_ICONS] Importing ${tableData.length} records...`);
        let imported = 0;

        for (const icon of tableData) {
          const { error } = await supabase
            .from('default_server_icons')
            .upsert({
              name: icon.name,
              name_normalized: icon.name_normalized || icon.name?.toLowerCase().replace(/\s+/g, ''),
              icon_url: icon.icon_url,
            }, { onConflict: 'name_normalized' });

          if (!error) imported++;
          processedItems++;
        }

        report.stats.imported.default_server_icons = imported;
      }
    }

    // ============================================
    // FASE 4: FINALIZAÇÃO E RELATÓRIO
    // ============================================
    report.phase = 'complete';
    report.endTime = Date.now();
    report.totalTimeMs = report.endTime - report.startTime;

    // Determinar status
    const totalImported = Object.values(report.stats.imported).reduce((a, b) => a + b, 0);
    const totalExpected = Object.values(report.stats.expected).reduce((a, b) => a + b, 0);
    const totalErrors = report.errorDetails.length;

    if (totalErrors === 0 && totalImported === totalExpected) {
      report.status = 'success';
    } else if (totalImported > 0) {
      report.status = 'partial_success';
    } else {
      report.status = 'failed';
    }

    console.log('\n=== IMPORT COMPLETE ===');
    console.log(`Status: ${report.status}`);
    console.log(`Time: ${report.totalTimeMs}ms`);
    console.log(`Imported:`, report.stats.imported);
    console.log(`Skipped:`, report.stats.skipped);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Mappings:`, report.mappings);

    // Atualizar job final
    await updateJob({
      status: 'completed',
      progress: 100,
      processed_items: processedItems,
      total_items: totalItems,
      restored: report.stats.imported,
      warnings: report.warnings,
      errors: report.errorDetails.slice(0, 100).map(e => `[${e.table}] ${e.reason}`),
    });

    return new Response(
      JSON.stringify({
        success: report.status !== 'failed',
        message: report.status === 'success' 
          ? 'Restore concluído com sucesso' 
          : report.status === 'partial_success'
            ? 'Restore concluído com alguns erros'
            : 'Restore falhou',
        report: {
          status: report.status,
          totalTimeMs: report.totalTimeMs,
          expected: report.stats.expected,
          imported: report.stats.imported,
          skipped: report.stats.skipped,
          errors: totalErrors,
          errorDetails: report.errorDetails.slice(0, 50),
          warnings: report.warnings,
          mappings: report.mappings,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('=== FATAL ERROR ===', errorMessage);

    report.endTime = Date.now();
    report.totalTimeMs = report.endTime - report.startTime;
    report.status = 'failed';

    await updateJob({
      status: 'failed',
      errors: [errorMessage],
    });

    return new Response(
      JSON.stringify({ 
        error: `Erro fatal na fase "${report.phase}": ${errorMessage}`,
        report: {
          status: report.status,
          phase: report.phase,
          totalTimeMs: report.totalTimeMs,
          imported: report.stats.imported,
          errors: report.errorDetails.length,
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
