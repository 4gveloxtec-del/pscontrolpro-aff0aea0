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
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crypto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: 'encrypt', data: plaintext }),
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

    // Buscar configuração de integração
    const { data: config, error: configError } = await supabase
      .from('test_integration_config')
      .select('*')
      .eq('seller_id', seller_id)
      .eq('is_active', true)
      .maybeSingle();

    if (configError) {
      console.error('[create-test-client] Config error:', configError);
    }

    // Se não há configuração ou auto_create_client está desabilitado, apenas loga
    if (!config || !config.auto_create_client) {
      console.log('[create-test-client] Auto-create disabled or no config, skipping client creation');
      
      // Registrar no log mesmo sem criar cliente
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone,
        api_response,
        client_created: false,
        error_message: 'Auto-create disabled or no configuration',
      });
      
      return new Response(
        JSON.stringify({ success: true, client_created: false, reason: 'auto_create_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================================
    // NORMALIZAÇÃO DO TELEFONE COM DDI 55
    // Garante que o telefone seja salvo no formato brasileiro padrão
    // =====================================================================
    console.log(`[create-test-client] Raw sender_phone received: "${sender_phone}"`);
    
    const normalizedPhone = normalizePhoneWithDDI(sender_phone);
    
    if (!normalizedPhone) {
      console.error(`[create-test-client] Failed to normalize phone: ${sender_phone}`);
      
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone,
        api_response,
        client_created: false,
        error_message: `Invalid phone number: ${sender_phone}`,
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_phone', raw_phone: sender_phone }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[create-test-client] Normalized phone: ${normalizedPhone} (from: ${sender_phone})`);
    
    // Verificar se já existe cliente com este telefone (evitar duplicatas)
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, name, phone')
      .eq('seller_id', seller_id)
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existingClient) {
      console.log(`[create-test-client] Client already exists: ${existingClient.name}`);
      
      await supabase.from('test_generation_log').insert({
        seller_id,
        api_id,
        sender_phone: normalizedPhone,
        api_response,
        client_id: existingClient.id,
        client_created: false,
        error_message: 'Client already exists with this phone',
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          client_created: false, 
          reason: 'client_exists',
          client_id: existingClient.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extrair dados da resposta da API usando os paths configurados
    const apiData = api_response as TestApiResponse;
    
    const username = extractByPath(apiData, config.map_login_path || 'username') as string || apiData.username;
    const password = extractByPath(apiData, config.map_password_path || 'password') as string || apiData.password;
    const dns = extractByPath(apiData, config.map_dns_path || 'dns') as string || apiData.dns;
    const expirationStr = extractByPath(apiData, config.map_expiration_path || 'expiresAtFormatted') as string 
      || apiData.expiresAtFormatted 
      || apiData.expiresAt;

    // Incrementar contador de testes
    const newCounter = (config.test_counter || 0) + 1;
    
    await supabase
      .from('test_integration_config')
      .update({ test_counter: newCounter })
      .eq('id', config.id);

    // Gerar nome do cliente
    const clientName = `${config.client_name_prefix || 'Teste'}${newCounter}`;

    // Criptografar credenciais
    const encryptedLogin = username ? await encryptData(supabaseUrl, serviceRoleKey, username) : null;
    const encryptedPassword = password ? await encryptData(supabaseUrl, serviceRoleKey, password) : null;

    // Parsear data de expiração
    const expirationDate = parseExpirationDate(expirationStr);
    
    // Se não houver data de expiração, usar uma data padrão (7 dias a partir de agora para testes)
    const defaultExpiration = new Date();
    defaultExpiration.setDate(defaultExpiration.getDate() + 7);
    const finalExpirationDate = expirationDate || defaultExpiration;

    console.log('[create-test-client] Creating client with data:', {
      name: clientName,
      phone: normalizedPhone,
      category: config.category || 'IPTV',
      server_id: config.server_id,
      expiration_date: finalExpirationDate.toISOString().split('T')[0],
      has_login: !!encryptedLogin,
      has_password: !!encryptedPassword,
      has_dns: !!dns,
    });

    // Criar o cliente - note: is_test column doesn't exist in schema, using notes to mark test clients
    const clientData: Record<string, unknown> = {
      seller_id,
      name: clientName,
      phone: normalizedPhone,
      category: config.category || 'IPTV',
      
      // Credenciais
      login: encryptedLogin,
      password: encryptedPassword,
      dns: dns || null,
      
      // Servidor (se configurado)
      server_id: config.server_id || null,
      
      // Data de expiração (obrigatória - usa padrão se não vier da API)
      expiration_date: finalExpirationDate.toISOString().split('T')[0],
      
      // Marcadores - use notes to identify test clients since is_test column doesn't exist
      notes: `[TESTE] Gerado automaticamente via comando WhatsApp em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Telefone: ${normalizedPhone}`,
    };

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

    console.log(`[create-test-client] ✅ Client created successfully:`, {
      id: newClient.id,
      name: clientName,
      phone: normalizedPhone,
      original_phone: sender_phone,
    });

    // Registrar no log
    await supabase.from('test_generation_log').insert({
      seller_id,
      api_id,
      sender_phone: normalizedPhone,
      api_response,
      client_id: newClient.id,
      username,
      password,
      dns,
      expiration_date: expirationDate?.toISOString().split('T')[0],
      client_created: true,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        client_created: true,
        client_id: newClient.id,
        client_name: clientName,
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
