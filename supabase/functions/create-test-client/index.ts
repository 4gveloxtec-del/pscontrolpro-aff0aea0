import { createClient } from "npm:@supabase/supabase-js@2";

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

/**
 * Extrai valor de um objeto usando notação de ponto (ex: "data.credentials.login")
 */
function extractByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return undefined;
  
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Criptografa dados sensíveis
 */
async function encryptData(supabaseUrl: string, serviceKey: string, plaintext: string): Promise<string> {
  // AbortController with 15s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crypto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: 'encrypt', data: plaintext }),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      console.error('[create-test-client] Encryption failed:', await response.text());
      return plaintext; // Fallback: não criptografado
    }
    
    const result = await response.json();
    return result.encrypted || plaintext;
  } catch (error) {
    console.error('[create-test-client] Encryption error:', error);
    return plaintext;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parseia data no formato brasileiro ou ISO
 */
function parseExpirationDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  // Formato: dd/MM/yyyy HH:mm:ss ou dd/MM/yyyy
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  // Formato ISO: yyyy-MM-dd
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  return null;
}

/**
 * Normaliza telefone para padrão brasileiro com DDI 55
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se não existir
 * - Garante formato consistente
 */
function normalizePhoneWithDDI(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove tudo que não é número
  let digits = phone.replace(/\D/g, '');
  
  if (digits.length < 8) {
    console.log(`[create-test-client] Phone too short: ${digits}`);
    return null;
  }
  
  // Se começa com 55 e tem 12-13 dígitos, já está correto
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  
  // Se tem 10-11 dígitos (DDD + número), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return '55' + digits;
  }
  
  // Se tem 8-9 dígitos (apenas número local), não temos DDD - retorna como está
  // Isso não deveria acontecer com WhatsApp, mas é um fallback
  if (digits.length >= 8 && digits.length <= 9) {
    console.log(`[create-test-client] Phone without DDD: ${digits}, keeping as-is`);
    return digits;
  }
  
  // Se já é um número grande (provavelmente internacional), manter como está
  return digits;
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
      command_id
    } = body;

    console.log(`[create-test-client] Creating client for seller ${seller_id}, phone ${sender_phone}`);

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
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone: normalizedPhone || sender_phone,
        api_response,
        username,
        password,
        dns,
        expiration_date: expirationDate?.toISOString().split('T')[0] || null,
        client_created: false,
        error_message: 'Auto-create disabled - log only',
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
    const configServerId = (config as Record<string, unknown>).server_id as string | null;

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
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          login: encryptedLogin,
          password: encryptedPassword,
          dns: dns || null,
          expiration_date: finalExpirationDatetime.toISOString().split('T')[0],
          expiration_datetime: finalExpirationDatetime.toISOString(),
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

    // Registrar no log
    await supabase.from('test_generation_log').insert({
      seller_id,
      api_id,
      sender_phone: normalizedPhone,
      api_response,
      client_id: clientId,
      username,
      password,
      dns,
      expiration_date: expirationDate?.toISOString().split('T')[0],
      client_created: wasCreated,
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
