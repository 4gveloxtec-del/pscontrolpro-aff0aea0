import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CommandResult {
  success: boolean;
  response?: string;
  error?: string;
  // Optional field to provide a safe, user-facing message when we want the bot to reply
  // even if the command was not processed (e.g. missing required inputs).
  user_message?: string;
}

/**
 * Normaliza telefone para apenas dígitos
 */
function normalizePhoneDigits(input: unknown): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return digits;
}

/**
 * Normaliza telefone para padrão brasileiro com DDI 55
 * Esta é a versão canônica usada para salvar no banco de dados
 */
function normalizePhoneWithDDI55(input: unknown): string {
  const digits = normalizePhoneDigits(input);
  if (!digits) return '';
  
  // Se já começa com 55 e tem 12-13 dígitos, está correto
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  
  // Se tem 10-11 dígitos (DDD + número brasileiro), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return '55' + digits;
  }
  
  // Outros formatos: retorna como está
  return digits;
}

/**
 * Formato que alguns servidores (ex: STARPLAY) exigem: "55 11 99999 3333"
 */
function formatBrazilPhoneWithSpaces(inputDigits: string): string {
  const brDigits = normalizePhoneWithDDI55(inputDigits);
  if (!brDigits) return '';

  // 55 + DDD(2) + celular(9) => 13 dígitos
  if (brDigits.startsWith('55') && brDigits.length === 13) {
    return `${brDigits.slice(0, 2)} ${brDigits.slice(2, 4)} ${brDigits.slice(4, 9)} ${brDigits.slice(9)}`;
  }

  // 55 + DDD(2) + fixo(8) => 12 dígitos
  if (brDigits.startsWith('55') && brDigits.length === 12) {
    return `${brDigits.slice(0, 2)} ${brDigits.slice(2, 4)} ${brDigits.slice(4, 8)} ${brDigits.slice(8)}`;
  }

  return brDigits;
}

function parseTestCommandArgs(commandText: string): { clientPhone: string; clientName: string } {
  const tokens = String(commandText || '').trim().split(/\s+/).filter(Boolean);
  const args = tokens.slice(1);

  let clientPhone = '';
  let phoneIndex = -1;

  for (let i = 0; i < args.length; i++) {
    const digits = normalizePhoneDigits(args[i]);
    if (digits) {
      clientPhone = digits;
      phoneIndex = i;
      break;
    }
  }

  const nameParts = args.filter((_, idx) => idx !== phoneIndex);
  const clientNameRaw = nameParts.join(' ').trim();
  const clientName = clientNameRaw || (clientPhone ? `Cliente ${clientPhone.slice(-4)}` : 'Cliente');

  return { clientPhone, clientName };
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && !v.trim());
}

function shouldOverwriteTemplateValue(current: unknown): boolean {
  if (isBlank(current)) return true;
  if (typeof current !== 'string') return false;

  // Common template syntaxes used in custom payload builders
  // Examples: "{phone}", "{{phone}}", "${phone}", "<phone>"
  const s = current.trim();
  return (
    /\{\{[^}]+\}\}/.test(s) ||
    /\{[^}]+\}/.test(s) ||
    /\$\{[^}]+\}/.test(s) ||
    /<[^>]+>/.test(s)
  );
}

function buildTestCommandPayload(params: {
  base: Record<string, unknown>;
  clientPhone: string;
  clientName: string;
  testPlan: string;
  serverId: string;
  serverName: string | null;
  sellerId: string;
  instanceName: string | null;
  whatsappNumber: string; // Número WhatsApp normalizado com DDI 55
}): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...params.base };

  // Guarantee required fields are present (root-level) using common key names.
  // We set the canonical keys unconditionally; aliases only if missing.
  payload.phone = params.clientPhone;
  payload.name = params.clientName;
  payload.plan = params.testPlan;
  payload.server = params.serverName || params.serverId;
  payload.seller_id = params.sellerId;
  
  // =====================================================================
  // CAMPOS DE WHATSAPP - Garantir que o número seja enviado corretamente
  // Inclui formatos usados por chatbots (remoteJid, sender, from) e 
  // formatos específicos de painéis IPTV (telefone, celular, contact)
  // =====================================================================
  
  // Formato JID do WhatsApp (usado por chatbots Evolution/Baileys)
  const whatsappJid = `${params.whatsappNumber}@s.whatsapp.net`;
  
  // Campos primários de WhatsApp
  payload.whatsapp = params.whatsappNumber;
  payload.whatsapp_number = params.whatsappNumber;
  payload.telefone = params.whatsappNumber;
  payload.celular = params.whatsappNumber;
  payload.contact = params.whatsappNumber;
  payload.contact_phone = params.whatsappNumber;
  
  // Campos de chatbot (remoteJid, sender, from) - formato esperado por Sigma/Evolution
  payload.remoteJid = whatsappJid;
  payload.remote_jid = whatsappJid;
  payload.sender = params.whatsappNumber;
  payload.senderNumber = params.whatsappNumber;
  payload.sender_number = params.whatsappNumber;
  payload.from = params.whatsappNumber;
  payload.fromNumber = params.whatsappNumber;
  payload.from_number = params.whatsappNumber;
  
  // Campos específicos de painéis IPTV
  payload.cliente_whatsapp = params.whatsappNumber;
  payload.cliente_telefone = params.whatsappNumber;
  payload.user_phone = params.whatsappNumber;
  payload.user_whatsapp = params.whatsappNumber;

  // Aliases (do not overwrite if already present)
  if (isBlank(payload.client_phone)) payload.client_phone = params.clientPhone;
  if (isBlank(payload.number)) payload.number = params.clientPhone;
  if (isBlank(payload.client_name)) payload.client_name = params.clientName;
  if (isBlank(payload.test_plan)) payload.test_plan = params.testPlan;
  if (isBlank(payload.package)) payload.package = params.testPlan;
  if (isBlank(payload.pacote)) payload.pacote = params.testPlan;
  if (isBlank(payload.server_id)) payload.server_id = params.serverId;
  if (isBlank(payload.reseller_id)) payload.reseller_id = params.sellerId;
  if (params.instanceName && isBlank(payload.instance_name)) payload.instance_name = params.instanceName;
  
  // Aliases de WhatsApp adicionais
  if (isBlank(payload.client_whatsapp)) payload.client_whatsapp = params.whatsappNumber;
  if (isBlank(payload.wpp)) payload.wpp = params.whatsappNumber;
  if (isBlank(payload.zap)) payload.zap = params.whatsappNumber;
  if (isBlank(payload.mobile)) payload.mobile = params.whatsappNumber;
  if (isBlank(payload.phone_number)) payload.phone_number = params.whatsappNumber;

  // If the template already has a nested structure, also populate common nested objects.
  // This avoids breaking existing integrations that expect data/client wrappers.
  const maybeData = payload.data;
  if (maybeData && typeof maybeData === 'object' && !Array.isArray(maybeData)) {
    const dataObj = maybeData as Record<string, unknown>;
    // Overwrite placeholders to prevent sending literal "{phone}" etc.
    if (shouldOverwriteTemplateValue(dataObj.phone)) dataObj.phone = params.clientPhone;
    if (shouldOverwriteTemplateValue(dataObj.name)) dataObj.name = params.clientName;
    if (shouldOverwriteTemplateValue(dataObj.plan)) dataObj.plan = params.testPlan;
    if (shouldOverwriteTemplateValue(dataObj.server)) dataObj.server = params.serverName || params.serverId;
    if (shouldOverwriteTemplateValue(dataObj.seller_id)) dataObj.seller_id = params.sellerId;
    if (shouldOverwriteTemplateValue(dataObj.server_id)) dataObj.server_id = params.serverId;
    // WhatsApp no objeto data
    if (shouldOverwriteTemplateValue(dataObj.whatsapp)) dataObj.whatsapp = params.whatsappNumber;
    if (shouldOverwriteTemplateValue(dataObj.whatsapp_number)) dataObj.whatsapp_number = params.whatsappNumber;
  }

  const maybeClient = payload.client;
  if (maybeClient && typeof maybeClient === 'object' && !Array.isArray(maybeClient)) {
    const clientObj = maybeClient as Record<string, unknown>;
    if (shouldOverwriteTemplateValue(clientObj.phone)) clientObj.phone = params.clientPhone;
    if (shouldOverwriteTemplateValue(clientObj.name)) clientObj.name = params.clientName;
    // WhatsApp no objeto client
    if (shouldOverwriteTemplateValue(clientObj.whatsapp)) clientObj.whatsapp = params.whatsappNumber;
    if (shouldOverwriteTemplateValue(clientObj.whatsapp_number)) clientObj.whatsapp_number = params.whatsappNumber;
  }

  return payload;
}

/**
 * Extrai valor de um objeto usando notação de ponto (ex: "data.credentials.login")
 */
function extractByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return obj;
  
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
 * Formata resposta para mensagem WhatsApp
 */
function formatResponse(data: unknown): string {
  if (data === null || data === undefined) return 'Sem dados';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  
  // Objeto ou array - formata de forma legível
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map((item, i) => `${i + 1}. ${formatResponse(item)}`).join('\n');
    }
    
    const obj = data as Record<string, unknown>;
    const lines: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      if (typeof value === 'object' && value !== null) {
        lines.push(`*${label}:*\n${formatResponse(value)}`);
      } else {
        lines.push(`*${label}:* ${value}`);
      }
    }
    
    return lines.join('\n');
  }
  
  return String(data);
}

/**
 * Aplica template customizado com variáveis da resposta da API e do sistema
 * Variáveis da API: {usuario}, {senha}, {vencimento}, {dns}, {pacote}, {nome}, {mac}, {valor}, {dias_restantes}
 * Variáveis do sistema: {empresa}, {pix}, {servidor}, {plano}, {apps}, {links}
 */
function applyCustomTemplate(
  template: string, 
  apiResponse: Record<string, unknown>,
  sellerData?: { company_name?: string; pix_key?: string } | null,
  serverName?: string | null,
  resellerApps?: Array<{ name: string; download_url?: string }> | null
): string {
  // Mapeamento de variáveis da API para possíveis campos na resposta
  const variableMapping: Record<string, string[]> = {
    usuario: ['username', 'user', 'login', 'usuario'],
    senha: ['password', 'pass', 'senha'],
    vencimento: ['expiresAtFormatted', 'expiresAt', 'expires', 'expiration', 'vencimento', 'validade'],
    dns: ['dns', 'server', 'host', 'url'],
    pacote: ['package', 'plan', 'plano', 'pacote'],
    nome: ['name', 'nome', 'client_name'],
    mac: ['mac', 'mac_address', 'device_mac'],
    valor: ['price', 'value', 'valor', 'amount'],
    dias_restantes: ['days_remaining', 'remaining_days', 'dias_restantes'],
  };

  let result = template;

  // Substituir variáveis da API
  for (const [varName, possibleKeys] of Object.entries(variableMapping)) {
    let value = '';
    
    // Procurar valor na resposta usando os possíveis nomes de campo
    for (const key of possibleKeys) {
      if (apiResponse[key] !== undefined && apiResponse[key] !== null) {
        value = String(apiResponse[key]);
        break;
      }
    }
    
    // Substituir a variável (case insensitive)
    const regex = new RegExp(`\\{${varName}\\}`, 'gi');
    result = result.replace(regex, value);
  }
  
  // Substituir variáveis do sistema
  if (sellerData?.company_name) {
    result = result.replace(/\{empresa\}/gi, sellerData.company_name);
  } else {
    result = result.replace(/\{empresa\}/gi, '');
  }
  
  if (sellerData?.pix_key) {
    result = result.replace(/\{pix\}/gi, sellerData.pix_key);
  } else {
    result = result.replace(/\{pix\}/gi, '');
  }
  
  if (serverName) {
    result = result.replace(/\{servidor\}/gi, serverName);
    result = result.replace(/\{plano\}/gi, serverName);
  } else {
    result = result.replace(/\{servidor\}/gi, '');
    result = result.replace(/\{plano\}/gi, '');
  }
  
  // Apps e links
  if (resellerApps && resellerApps.length > 0) {
    const appNames = resellerApps.map(a => `• ${a.name}`).join('\n');
    const appLinks = resellerApps
      .filter(a => a.download_url)
      .map(a => `📥 ${a.name}: ${a.download_url}`)
      .join('\n');
    
    result = result.replace(/\{apps\}/gi, appNames);
    result = result.replace(/\{links\}/gi, appLinks);
  } else {
    result = result.replace(/\{apps\}/gi, '');
    result = result.replace(/\{links\}/gi, '');
  }
  
  // Substituir {resposta} com a resposta formatada completa (fallback)
  result = result.replace(/\{resposta\}/gi, formatResponse(apiResponse));
  
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { 
      seller_id, 
      command_text, 
      sender_phone, 
      instance_name, 
      logs_enabled = true,
      from_attendant = false // Flag para indicar disparo ativo pelo atendente
    } = body;

    console.log(`[process-command] Received: "${command_text}" from ${sender_phone} for seller ${seller_id}, logs_enabled: ${logs_enabled}, from_attendant: ${from_attendant}`);

    // More explicit validation (this was previously a generic "Missing required fields")
    const missing: string[] = [];
    if (!seller_id) missing.push('seller_id');
    if (!command_text) missing.push('command_text');
    if (!sender_phone) missing.push('sender_phone');
    if (missing.length > 0) {
      const userMsg = missing.includes('sender_phone')
        ? 'Não consegui identificar seu WhatsApp. Envie novamente a mensagem.'
        : 'Dados obrigatórios ausentes para processar o comando.';

      return new Response(
        JSON.stringify({ success: false, error: `Missing required fields: ${missing.join(', ')}`, user_message: userMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Normalizar comando (lowercase, sem espaços extras)
    // O comando é armazenado COM a barra no banco (ex: /teste)
    const normalizedCommand = command_text.toLowerCase().trim().split(' ')[0];

    // Buscar comando do owner
    const { data: commandData, error: cmdError } = await supabase
      .from('whatsapp_commands')
      .select(`
        id, command, response_template, is_active,
        test_apis (
          id, name, api_url, api_method, api_headers, api_body_template, response_path, is_active,
          custom_response_template, use_custom_response
        )
      `)
      .eq('owner_id', seller_id)
      .eq('command', normalizedCommand)
      .eq('is_active', true)
      .maybeSingle();

    if (cmdError) {
      const errorMsg = cmdError.message || cmdError.details || JSON.stringify(cmdError);
      console.error('[process-command] DB error:', errorMsg);
      throw new Error(errorMsg);
    }

    if (!commandData) {
      console.log(`[process-command] Command not found: ${normalizedCommand}`);
      return new Response(
        JSON.stringify({ success: false, error: "Comando não encontrado", not_found: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiData = commandData.test_apis as unknown;
    const api = apiData as {
      id: string;
      name?: string;
      api_url: string;
      api_method: string;
      api_headers: Record<string, string>;
      api_body_template: Record<string, unknown> | null;
      response_path: string | null;
      custom_response_template: string | null;
      use_custom_response: boolean;
      is_active: boolean;
    } | null;

    if (!api || !api.is_active) {
      console.log('[process-command] API not active');
      return new Response(
        JSON.stringify({ success: false, error: "API desativada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados do vendedor para variáveis do sistema
    let sellerData: { company_name?: string; pix_key?: string } | null = null;
    let resellerApps: Array<{ name: string; download_url?: string }> | null = null;
    let serverName: string | null = null;

    if (api.use_custom_response && api.custom_response_template) {
      // Only fetch if template might use system variables
      const needsSellerData = /\{(empresa|pix)\}/i.test(api.custom_response_template);
      const needsApps = /\{(apps|links)\}/i.test(api.custom_response_template);
      const needsServer = /\{(servidor|plano)\}/i.test(api.custom_response_template);

      if (needsSellerData) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_name, pix_key')
          .eq('id', seller_id)
          .maybeSingle();
        sellerData = profile;
      }

      if (needsApps) {
        const { data: apps } = await supabase
          .from('reseller_device_apps')
          .select('name, download_url')
          .eq('seller_id', seller_id)
          .eq('is_active', true);
        resellerApps = apps;
      }

      if (needsServer) {
        // Try to get the first configured server for this seller
        const { data: serverData } = await supabase
          .from('servers')
          .select('name')
          .eq('seller_id', seller_id)
          .limit(1)
          .maybeSingle();
        serverName = serverData?.name || null;
      }
    }

    // Executar chamada à API
    let result: CommandResult;
    let apiResponse: unknown = null;
    let apiRequest: Record<string, unknown> = { url: api.api_url, method: api.api_method };

    // ===============================================================
    // /teste e /testestar: garantir payload mínimo para geração de teste
    // ===============================================================
    const isTestCommand = normalizedCommand === '/teste' || normalizedCommand === '/testestar';
    let testConfig: { server_id: string | null; server_name: string | null; client_name_prefix: string | null; category: string | null } | null = null;
    
    // Parse arguments from command text
    let { clientPhone, clientName } = isTestCommand
      ? parseTestCommandArgs(String(command_text || ''))
      : { clientPhone: '', clientName: '' };
    
    // =====================================================================
    // CRITICAL FIX: If no phone provided in command, use SENDER's phone
    // - Cliente envia /teste -> sender_phone é o próprio cliente
    // - Atendente envia /teste -> sender_phone é o cliente na conversa (remoteJid)
    // =====================================================================
    if (isTestCommand && !clientPhone && sender_phone) {
      clientPhone = normalizePhoneDigits(sender_phone);
      console.log(`[process-command] No phone in command args, using sender_phone: ${clientPhone} (from_attendant: ${from_attendant})`);
    }
    
    const testPlan = (api?.name && String(api.name).trim())
      ? String(api.name).trim()
      : normalizedCommand.replace('/', '').trim();

    if (isTestCommand) {
      // Primeiro tenta buscar config específica para esta API
      let { data: cfg, error: cfgErr } = await supabase
        .from('test_integration_config')
        .select('server_id, server_name, client_name_prefix, category')
        .eq('seller_id', seller_id)
        .eq('api_id', api.id)
        .eq('is_active', true)
        .maybeSingle();

      // Se não encontrar config específica, busca qualquer config ativa do seller
      if (!cfg && !cfgErr) {
        const { data: fallbackCfg, error: fallbackErr } = await supabase
          .from('test_integration_config')
          .select('server_id, server_name, client_name_prefix, category')
          .eq('seller_id', seller_id)
          .eq('is_active', true)
          .not('server_id', 'is', null)
          .limit(1)
          .maybeSingle();
        
        if (fallbackErr) {
          console.error('[process-command] test_integration_config fallback error:', fallbackErr);
        }
        cfg = fallbackCfg;
      }

      if (cfgErr) {
        console.error('[process-command] test_integration_config error:', cfgErr);
      }
      testConfig = cfg as any;
      
      console.log(`[process-command] Test config for API ${api.id}: server_id=${testConfig?.server_id}, server_name=${testConfig?.server_name}`);

      // clientPhone should now be available (from args OR sender_phone)
      if (!clientPhone) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'client_phone_missing',
            user_message: 'Não foi possível identificar seu número. Tente novamente.',
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (!testConfig?.server_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'server_missing', user_message: 'Selecione um servidor válido' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (!testPlan) {
        return new Response(
          JSON.stringify({ success: false, error: 'test_plan_missing', user_message: 'Plano de teste não encontrado' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // =====================================================================
      // REGRA DE NEGÓCIO: LIMITE DE 1 TESTE POR TELEFONE
      // Verificar ANTES de chamar a API externa para não desperdiçar créditos
      // =====================================================================
      const normalizedPhoneForDB = normalizePhoneWithDDI55(clientPhone);
      
      if (!normalizedPhoneForDB) {
        console.error(`[process-command] Failed to normalize phone: ${clientPhone}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'invalid_phone_format',
            user_message: '❌ Número de telefone inválido. Verifique e tente novamente.',
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
      
      // Bloqueio de duplicidade removido - deixar o servidor IPTV controlar
      // A resposta do servidor será enviada diretamente ao cliente
      console.log(`[process-command] ✅ Sending test request to IPTV server for phone: ${normalizedPhoneForDB}`);
      
      // Atualizar clientPhone para usar a versão normalizada com DDI
      clientPhone = normalizedPhoneForDB;
    }

    try {
      const fetchOptions: RequestInit = {
        method: api.api_method,
        headers: {
          'Content-Type': 'application/json',
          ...api.api_headers,
        },
      };

      // Build request for /teste and /testestar
      let finalUrl = api.api_url;
      if (isTestCommand) {
        // Use name provided in the command. If user didn't provide it, fall back to a safe default.
        const finalClientName = (clientName || '').trim() || `Cliente ${clientPhone.slice(-4)}`;

        // =====================================================================
        // PADRONIZAÇÃO: TODAS AS APIS RECEBEM O MESMO FORMATO DE TELEFONE
        // Não importa o nome da API (STARPLAY, Azonix, etc.) - todas recebem:
        // 1. clientPhoneDigits: apenas dígitos (ex: 5531999887766)
        // 2. clientPhoneFormatted: com espaços brasileiros (ex: 55 31 99988 7766)
        // 3. whatsappNumber: normalizado com DDI 55 (ex: 5531999887766)
        // =====================================================================
        const clientPhoneDigits = clientPhone; // Já normalizado com DDI 55
        const clientPhoneFormatted = formatBrazilPhoneWithSpaces(clientPhoneDigits);

        const base = (api.api_body_template && typeof api.api_body_template === 'object')
          ? api.api_body_template
          : {};

        const payload = buildTestCommandPayload({
          base,
          // STARPLAY e outros painéis que esperam formato com espaços no campo principal
          clientPhone: clientPhoneFormatted,
          clientName: finalClientName,
          testPlan,
          serverId: testConfig!.server_id!,
          serverName: testConfig?.server_name || null,
          sellerId: seller_id,
          instanceName: instance_name || null,
          whatsappNumber: clientPhoneDigits, // Número normalizado com DDI 55 (sem espaços)
        });
        
        console.log(`[process-command] 📞 Phone sent to ALL APIs: digits="${clientPhoneDigits}" formatted="${clientPhoneFormatted}"`);

        // =====================================================================
        // GARANTIR TODOS OS FORMATOS DE NÚMERO PARA COMPATIBILIDADE MÁXIMA
        // Cada painel IPTV pode esperar o telefone em campos diferentes
        // =====================================================================
        
        // Versão apenas dígitos - CRÍTICO para APIs como Azonix que não aceitam espaços
        payload.phone_digits = clientPhoneDigits;
        payload.client_phone_digits = clientPhoneDigits;
        payload.number_digits = clientPhoneDigits;
        payload.telefone_digits = clientPhoneDigits;
        payload.celular_digits = clientPhoneDigits;
        
        // Garantir que os campos aninhados (data.*, client.*) também tenham versão dígitos
        if (payload.data && typeof payload.data === 'object') {
          const dataObj = payload.data as Record<string, unknown>;
          dataObj.phone_digits = clientPhoneDigits;
          dataObj.telefone = clientPhoneDigits;
          dataObj.celular = clientPhoneDigits;
          dataObj.whatsapp = clientPhoneDigits;
        }
        if (payload.client && typeof payload.client === 'object') {
          const clientObj = payload.client as Record<string, unknown>;
          clientObj.phone_digits = clientPhoneDigits;
          clientObj.telefone = clientPhoneDigits;
          clientObj.celular = clientPhoneDigits;
          clientObj.whatsapp = clientPhoneDigits;
        }
        
        // Versão formatada com espaços (STARPLAY e similares)
        payload.phone_formatted = clientPhoneFormatted;
        payload.number_formatted = clientPhoneFormatted;

        if (api.api_method === 'POST') {
          fetchOptions.body = JSON.stringify(payload);
          apiRequest.body = payload;
        } else if (api.api_method === 'GET') {
          const url = new URL(finalUrl);
          url.searchParams.set('phone', clientPhoneFormatted); // Formato com espaços
          url.searchParams.set('phone_digits', clientPhoneDigits); // Apenas dígitos
          url.searchParams.set('phone_formatted', clientPhoneFormatted);
          url.searchParams.set('whatsapp', clientPhoneDigits); // WhatsApp normalizado com DDI
          url.searchParams.set('whatsapp_number', clientPhoneDigits);
          url.searchParams.set('name', String(payload.name || ''));
          url.searchParams.set('plan', String(payload.plan || ''));
          url.searchParams.set('server', String(payload.server || ''));
          url.searchParams.set('seller_id', seller_id);
          finalUrl = url.toString();
        }
      } else if (api.api_method === 'POST' && api.api_body_template) {
        fetchOptions.body = JSON.stringify(api.api_body_template);
        apiRequest.body = api.api_body_template;
      }

      apiRequest.url = finalUrl;

      console.log(`[process-command] Calling API: ${api.api_method} ${finalUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(finalUrl, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`[process-command] API response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`API retornou ${response.status}: ${responseText.substring(0, 200)}`);
      }

      // Tentar parsear como JSON
      try {
        apiResponse = JSON.parse(responseText);
      } catch {
        apiResponse = responseText;
      }

      // Extrair dados pelo path se configurado
      let extractedData = apiResponse;

      // If no response_path is configured, prefer common "reply" field (avoids huge JSON dumps)
      // Many chatbot APIs return a ready-to-send WhatsApp message in "reply".
      if (!api.response_path && apiResponse && typeof apiResponse === 'object') {
        const maybeReply = (apiResponse as Record<string, unknown>)['reply'];
        if (typeof maybeReply === 'string' && maybeReply.trim()) {
          extractedData = maybeReply;
        }
      } else if (api.response_path && typeof apiResponse === 'object') {
        extractedData = extractByPath(apiResponse, api.response_path);
      }

      // Determinar mensagem final
      let finalMessage: string;
      
      // Se tem template customizado e está habilitado, usar ele
      if (api.use_custom_response && api.custom_response_template && typeof apiResponse === 'object') {
        console.log('[process-command] Using custom response template with system variables');
        finalMessage = applyCustomTemplate(
          api.custom_response_template, 
          apiResponse as Record<string, unknown>,
          sellerData,
          serverName,
          resellerApps
        );
      } else {
        // Usar resposta formatada padrão
        const formattedResponse = formatResponse(extractedData);
        finalMessage = commandData.response_template.replace('{response}', formattedResponse);
      }

      result = { success: true, response: finalMessage };

    } catch (apiError: unknown) {
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
      console.error('[process-command] API call failed:', errorMessage);
      result = { success: false, error: errorMessage };
    }

    const executionTime = Date.now() - startTime;

    // Registrar log apenas se habilitado
    if (logs_enabled) {
      await supabase.from('command_logs').insert({
        owner_id: seller_id,
        command_id: commandData.id,
        command_text: normalizedCommand,
        sender_phone,
        api_request: apiRequest,
        api_response: typeof apiResponse === 'object' ? apiResponse : { raw: apiResponse },
        response_sent: result.response || null,
        success: result.success,
        error_message: result.error || null,
        execution_time_ms: executionTime,
      });
    } else {
      console.log(`[process-command] Logs disabled, skipping log insert`);
    }

    // Atualizar contador de uso
    if (result.success) {
      // Fetch current usage_count to increment properly
      const currentUsageCount = typeof (commandData as Record<string, unknown>).usage_count === 'number' 
        ? (commandData as Record<string, unknown>).usage_count as number 
        : 0;
      
      await supabase
        .from('whatsapp_commands')
        .update({ usage_count: currentUsageCount + 1 })
        .eq('id', commandData.id);

      // Criar cliente automaticamente se API retornou dados válidos
      // IMPORTANTE: isTestCommand garante que clientPhone já foi normalizado com DDI55
      if (isTestCommand && apiResponse && typeof apiResponse === 'object') {
        try {
          // clientPhone já está normalizado com DDI55 (feito antes da chamada à API)
          const phoneForClient = clientPhone || normalizePhoneWithDDI55(sender_phone);
          
          console.log(`[process-command] Triggering auto-create client with phone: ${phoneForClient}`);
          
          // Timeout para chamada interna - evita bloqueio indefinido
          const createController = new AbortController();
          const createTimeoutId = setTimeout(() => createController.abort(), 15000);
          
          try {
            const createClientResponse = await fetch(`${supabaseUrl}/functions/v1/create-test-client`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                seller_id,
                sender_phone: phoneForClient, // Telefone normalizado com DDI55
                api_response: apiResponse,
                api_id: api?.id,
                command_id: commandData.id,
              }),
              signal: createController.signal,
            });
            
            clearTimeout(createTimeoutId);

            if (createClientResponse.ok) {
              const createResult = await createClientResponse.json();
              console.log('[process-command] Auto-create client result:', createResult);
            } else {
              console.error('[process-command] Auto-create client failed:', await createClientResponse.text());
            }
          } catch (fetchError: any) {
            clearTimeout(createTimeoutId);
            if (fetchError.name === 'AbortError') {
              console.warn('[process-command] Auto-create client timed out after 15s');
            } else {
              throw fetchError;
            }
          }
        } catch (createError) {
          // Não falhar o comando principal se a criação do cliente falhar
          console.error('[process-command] Auto-create client error:', createError);
        }
      }
    }

    console.log(`[process-command] Completed in ${executionTime}ms, success: ${result.success}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    // Handle all error types properly
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      // Handle PostgrestError and other object errors
      const errObj = error as Record<string, unknown>;
      message = errObj.message as string || errObj.error as string || errObj.details as string || JSON.stringify(error);
    }
    console.error('[process-command] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
