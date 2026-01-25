import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhoneWithDDI } from "../_shared/phone-utils.ts";
import { parseExpirationDate, formatDateBR, toISODateString } from "../_shared/date-utils.ts";
import { encryptData } from "../_shared/crypto-utils.ts";
import { extractByPath } from "../_shared/object-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestApiResponse {
  username?: string;
  password?: string;
  dns?: string;
  expiresAt?: string;
  expiresAtFormatted?: string;
  package?: string;
  reply?: string;
  [key: string]: unknown;
}

interface TestConfig {
  id: string;
  seller_id: string;
  api_id: string | null;
  server_id: string | null;
  client_name_prefix: string;
  test_counter: number;
  auto_create_client: boolean;
  map_login_path: string;
  map_password_path: string;
  map_dns_path: string;
  map_expiration_path: string;
  category: string;
  default_duration_hours: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { 
      seller_id, 
      sender_phone, 
      api_response,
      api_id,
      command_id,
      // NOVO: Aceitar server_id diretamente do process-whatsapp-command
      // Isso elimina o fallback incorreto que pode pegar servidor errado
      server_id_override
    } = body;

    console.log(`[create-test-client] Creating client for seller ${seller_id}, phone ${sender_phone}, api_id: ${api_id}, server_override: ${server_id_override}`);

    if (!seller_id || !sender_phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing seller_id or sender_phone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar configuração de integração - priorizar por api_id se disponível
    let config: Record<string, unknown> | null = null;
    let configError: Error | null = null;
    
    // Primeiro tenta buscar configuração específica para a API usada
    if (api_id) {
      const { data: apiConfig, error: apiConfigError } = await supabase
        .from('test_integration_config')
        .select('*')
        .eq('seller_id', seller_id)
        .eq('api_id', api_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (apiConfigError) {
        console.error('[create-test-client] API-specific config error:', apiConfigError);
        configError = apiConfigError as unknown as Error;
      } else if (apiConfig) {
        config = apiConfig;
        console.log(`[create-test-client] Found config for api_id: ${api_id}`);
      }
    }
    
    // Se não encontrou por api_id, busca qualquer configuração ativa do seller
    if (!config) {
      const { data: fallbackConfig, error: fallbackError } = await supabase
        .from('test_integration_config')
        .select('*')
        .eq('seller_id', seller_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (fallbackError) {
        console.error('[create-test-client] Fallback config error:', fallbackError);
        configError = fallbackError as unknown as Error;
      } else {
        config = fallbackConfig;
        console.log(`[create-test-client] Using fallback config for seller: ${seller_id}`);
      }
    }
    
    if (configError) {
      console.error('[create-test-client] Config error:', configError);
    }

    // =====================================================================
    // NORMALIZAÇÃO INICIAL - Executada ANTES de qualquer lógica
    // Garante que o telefone seja salvo no formato brasileiro padrão
    // =====================================================================
    console.log(`[create-test-client] Raw sender_phone received: "${sender_phone}"`);
    
    const normalizedPhone = normalizePhoneWithDDI(sender_phone);
    
    // Extrair dados da resposta da API (usado tanto para log quanto para criação de cliente)
    const apiData = api_response as TestApiResponse;
    const mapLoginPath = (config?.map_login_path as string) || 'username';
    const mapPasswordPath = (config?.map_password_path as string) || 'password';
    const mapDnsPath = (config?.map_dns_path as string) || 'dns';
    const mapExpirationPath = (config?.map_expiration_path as string) || 'expiresAtFormatted';
    
    const username = extractByPath(apiData, mapLoginPath) as string || apiData.username;
    const password = extractByPath(apiData, mapPasswordPath) as string || apiData.password;
    const dns = extractByPath(apiData, mapDnsPath) as string || apiData.dns;
    const expirationStr = extractByPath(apiData, mapExpirationPath) as string 
      || apiData.expiresAtFormatted 
      || apiData.expiresAt;
    const expirationDate = parseExpirationDate(expirationStr);
    
    // =====================================================================
    // SEMPRE REGISTRAR NO LOG - independente de auto_create_client
    // Isso permite visualizar todos os testes na aba "Testes"
    // =====================================================================
    
    // Se não há configuração ou auto_create_client está desabilitado, apenas loga (sem criar cliente)
    if (!config || !config.auto_create_client) {
      console.log('[create-test-client] Auto-create disabled or no config, registering log only (no client creation)');
      
      // Registrar no log SEMPRE - mesmo sem criar cliente
      // Gerar nome do teste mesmo sem criar cliente para rastreamento
      const testCounter = Number((config as Record<string, unknown>)?.test_counter) || 0;
      const newCounter = testCounter + 1;
      const clientNamePrefix = ((config as Record<string, unknown>)?.client_name_prefix as string) || 'Teste';
      const testName = username 
        ? `${clientNamePrefix}${newCounter} - ${username}`
        : `${clientNamePrefix}${newCounter}`;
      const configServerIdForLog = (config as Record<string, unknown>)?.server_id as string | null;
      
      // Calcular datetime de expiração para log-only (usar duração padrão)
      const durationHours = Number((config as Record<string, unknown>)?.default_duration_hours) || 2;
      const logExpirationDatetime = new Date();
      logExpirationDatetime.setHours(logExpirationDatetime.getHours() + durationHours);
      
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone: normalizedPhone || sender_phone,
        api_response,
        username,
        password,
        dns,
        expiration_date: expirationDate?.toISOString().split('T')[0] || logExpirationDatetime.toISOString().split('T')[0],
        expiration_datetime: expirationDate?.toISOString() || logExpirationDatetime.toISOString(),
        client_created: false,
        error_message: 'Auto-create disabled - log only',
        test_name: testName,
        server_id: configServerIdForLog,
        notified_20min: false,
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          client_created: false, 
          reason: 'auto_create_disabled',
          log_registered: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================================
    // VALIDAÇÃO DO TELEFONE NORMALIZADO
    // =====================================================================
    if (!normalizedPhone) {
      console.error(`[create-test-client] Failed to normalize phone: ${sender_phone}`);
      
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone,
        api_response,
        username,
        password,
        dns,
        expiration_date: expirationDate?.toISOString().split('T')[0] || null,
        client_created: false,
        error_message: `Invalid phone number: ${sender_phone}`,
        test_name: null,
        server_id: (config as Record<string, unknown>)?.server_id as string || null,
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_phone', raw_phone: sender_phone }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[create-test-client] Normalized phone: ${normalizedPhone} (from: ${sender_phone})`);
    
    // Verificar se já existe cliente com este telefone para atualizar em vez de criar
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, name, phone')
      .eq('seller_id', seller_id)
      .eq('phone', normalizedPhone)
      .maybeSingle();

    // Se existir, vamos atualizar as credenciais (usuário pode ter deletado no servidor e criado novamente)
    const isUpdate = !!existingClient;
    if (isUpdate) {
      console.log(`[create-test-client] Client exists, will update: ${existingClient.name}`);
    }

    // Incrementar contador de testes
    const testCounter = Number((config as Record<string, unknown>).test_counter) || 0;
    const newCounter = testCounter + 1;
    
    const configId = (config as Record<string, unknown>).id as string;
    await supabase
      .from('test_integration_config')
      .update({ test_counter: newCounter })
      .eq('id', configId);

    // Gerar nome do cliente - incluir username para facilitar busca
    // O username não é criptografado no nome, permitindo busca textual
    const clientNamePrefix = ((config as Record<string, unknown>).client_name_prefix as string) || 'Teste';
    const clientName = username 
      ? `${clientNamePrefix}${newCounter} - ${username}`
      : `${clientNamePrefix}${newCounter}`;

    // Criptografar credenciais
    const encryptedLogin = username ? await encryptData(supabaseUrl, serviceRoleKey, username) : null;
    const encryptedPassword = password ? await encryptData(supabaseUrl, serviceRoleKey, password) : null;

    // Calcular expiração final:
    // 1. Se a API retornou uma data válida (expirationDate já calculado no início), usar ela
    // 2. Senão, usar a duração padrão configurada (em horas)
    let finalExpirationDatetime: Date;
    let isShortTest = false;
    
    if (expirationDate) {
      finalExpirationDatetime = expirationDate;
    } else {
      // Usar duração configurável (padrão: 2 horas para testes IPTV)
      const durationHours = Number((config as Record<string, unknown>).default_duration_hours) || 2;
      finalExpirationDatetime = new Date();
      finalExpirationDatetime.setHours(finalExpirationDatetime.getHours() + durationHours);
      isShortTest = durationHours <= 24; // Testes de até 24h são considerados "curtos"
      console.log(`[create-test-client] Using configured duration: ${durationHours} hours (short test: ${isShortTest})`);
    }

    const configCategory = ((config as Record<string, unknown>).category as string) || 'IPTV';
    // PRIORIDADE: server_id_override > config.server_id
    // Isso garante que o servidor passado pelo command seja usado, não o fallback
    const configServerId = server_id_override || (config as Record<string, unknown>).server_id as string | null;

    console.log('[create-test-client] Creating client with data:', {
      name: clientName,
      phone: normalizedPhone,
      category: configCategory,
      server_id: configServerId,
      expiration_datetime: finalExpirationDatetime.toISOString(),
      is_short_test: isShortTest,
      has_login: !!encryptedLogin,
      has_password: !!encryptedPassword,
      has_dns: !!dns,
    });

    // Criar o cliente com suporte a testes curtos (horas)
    // =====================================================================
    // INTEGRAÇÃO: Clientes criados via API recebem is_integrated = true
    // Apenas esses clientes participam da sincronização automática
    // =====================================================================
    const clientData: Record<string, unknown> = {
      seller_id,
      name: clientName,
      phone: normalizedPhone,
      category: configCategory,
      
      // Credenciais
      login: encryptedLogin,
      password: encryptedPassword,
      dns: dns || null,
      
      // Servidor (se configurado)
      server_id: configServerId,
      
      // Data de expiração (formato date para compatibilidade)
      expiration_date: finalExpirationDatetime.toISOString().split('T')[0],
      
      // Timestamp preciso para testes curtos (horas)
      expiration_datetime: finalExpirationDatetime.toISOString(),
      
      // Marcar como cliente de teste
      is_test: true,
      
      // =====================================================================
      // CAMPOS DE INTEGRAÇÃO - Sincronização automática habilitada
      // =====================================================================
      is_integrated: true,
      integration_origin: 'api',
      
      // Notas com informações do teste
      notes: `[TESTE API] Gerado automaticamente via comando WhatsApp em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Expira: ${finalExpirationDatetime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. [INTEGRADO]`,
    };

    let clientId: string;
    let wasCreated: boolean;

    if (isUpdate && existingClient) {
      // Atualizar cliente existente com novas credenciais
      // IMPORTANTE: Atualizar também is_test e is_integrated para garantir que apareça na aba "Testes API"
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          login: encryptedLogin,
          password: encryptedPassword,
          dns: dns || null,
          expiration_date: finalExpirationDatetime.toISOString().split('T')[0],
          expiration_datetime: finalExpirationDatetime.toISOString(),
          // Garantir que as flags de teste estejam corretas
          is_test: true,
          is_integrated: true,
          integration_origin: 'api',
          notes: `[TESTE API] Atualizado via comando WhatsApp em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Expira: ${finalExpirationDatetime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. [INTEGRADO]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingClient.id);

      if (updateError) {
        console.error('[create-test-client] Update error:', updateError);
        
        await supabase.from('test_generation_log').insert({
          seller_id,
          api_id,
          sender_phone: normalizedPhone,
          api_response,
          username,
          password,
          dns,
          expiration_date: expirationDate?.toISOString().split('T')[0],
          client_created: false,
          error_message: updateError.message,
          test_name: clientName,
          server_id: configServerId,
        });
        
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      clientId = existingClient.id;
      wasCreated = false;
      console.log(`[create-test-client] ✅ Client updated successfully: ${existingClient.id}`);
    } else {
      // Criar novo cliente
      const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert(clientData)
        .select('id')
        .single();

      if (insertError) {
        console.error('[create-test-client] Insert error:', insertError);
        
        await supabase.from('test_generation_log').insert({
          seller_id,
          api_id,
          sender_phone: normalizedPhone,
          api_response,
          username,
          password,
          dns,
          expiration_date: expirationDate?.toISOString().split('T')[0],
          client_created: false,
          error_message: insertError.message,
          test_name: clientName,
          server_id: configServerId,
        });
        
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      clientId = newClient.id;
      wasCreated = true;
      console.log(`[create-test-client] ✅ Client created successfully:`, {
        id: newClient.id,
        name: clientName,
        phone: normalizedPhone,
        original_phone: sender_phone,
      });
    }

    // Registrar no log com nome do teste, servidor e datetime preciso
    await supabase.from('test_generation_log').insert({
      seller_id,
      api_id,
      sender_phone: normalizedPhone,
      api_response,
      client_id: clientId,
      username,
      password,
      dns,
      expiration_date: finalExpirationDatetime.toISOString().split('T')[0],
      expiration_datetime: finalExpirationDatetime.toISOString(), // Precisão em horas/minutos
      client_created: wasCreated,
      test_name: clientName,
      server_id: configServerId,
      notified_20min: false,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        client_created: wasCreated,
        client_updated: !wasCreated,
        client_id: clientId,
        client_name: wasCreated ? clientName : existingClient?.name,
        client_phone: normalizedPhone,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-test-client] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
