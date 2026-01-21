import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== TIMEOUT AND RETRY CONFIGURATION ==========
const API_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

// ========== FETCH WITH TIMEOUT ==========
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ========== FETCH WITH RETRY ==========
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // Don't retry client errors (4xx), only server errors (5xx)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      // Server error - retry
      if (attempt < maxRetries) {
        console.log(`[Retry] Attempt ${attempt + 1} failed with ${response.status}, retrying...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        console.log(`[Retry] Attempt ${attempt + 1} timed out`);
      } else {
        console.log(`[Retry] Attempt ${attempt + 1} error:`, error.message);
      }
      
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

interface IncomingMessage {
  key: { remoteJid: string; fromMe: boolean };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: object;
    audioMessage?: object;
    videoMessage?: object;
    stickerMessage?: object;
    buttonsResponseMessage?: { selectedButtonId: string };
    listResponseMessage?: { singleSelectReply?: { selectedRowId: string } };
  };
  pushName?: string;
  messageTimestamp?: number;
}

interface WebhookPayload {
  event: string;
  instance: string;
  data?: IncomingMessage;
  sender?: string;
}

type RawWebhookPayload = Record<string, unknown>;

function normalizeWebhookPayload(raw: RawWebhookPayload): WebhookPayload {
  const eventCandidate =
    (raw?.event as unknown) ??
    (raw?.type as unknown) ??
    ((raw as any)?.data?.event as unknown) ??
    ((raw as any)?.data?.type as unknown) ??
    "";

  const rawInstanceCandidate: unknown =
    (raw as any)?.instance ??
    (raw as any)?.instanceName ??
    (raw as any)?.data?.instance ??
    (raw as any)?.data?.instanceName ??
    (raw as any)?.data?.instance?.instanceName ??
    (raw as any)?.data?.instance?.name ??
    (raw as any)?.instance?.instanceName ??
    (raw as any)?.instance?.name ??
    "";

  const event = typeof eventCandidate === "string" ? eventCandidate : String(eventCandidate || "");

  let instance = "";
  if (typeof rawInstanceCandidate === "string") {
    instance = rawInstanceCandidate;
  } else if (rawInstanceCandidate && typeof rawInstanceCandidate === "object") {
    instance =
      String((rawInstanceCandidate as any)?.instanceName || "") ||
      String((rawInstanceCandidate as any)?.name || "") ||
      String((rawInstanceCandidate as any)?.instance || "") ||
      "";
  } else {
    instance = String(rawInstanceCandidate || "");
  }

  let data: IncomingMessage | undefined = undefined;
  const candidates: unknown[] = [
    (raw as any)?.data,
    (raw as any)?.message,
    (raw as any)?.messages?.[0],
    (raw as any)?.data?.data,
    (raw as any)?.data?.message,
    (raw as any)?.data?.messages?.[0],
    (raw as any)?.data?.messages?.[0]?.message,
    (raw as any)?.data?.payload,
    (raw as any)?.payload,
  ].filter(Boolean);

  for (const c of candidates) {
    const msg = c as any;
    if (msg?.key?.remoteJid) {
      data = msg as IncomingMessage;
      break;
    }
  }

  return {
    event: String(event || ""),
    instance: String(instance || ""),
    data,
    sender: (raw?.sender as string | undefined) ?? undefined,
  };
}

interface ChatbotRule {
  id: string;
  name: string;
  seller_id: string;
  trigger_text: string;
  response_type: string;
  response_content: {
    text: string;
    image_url?: string;
    buttons?: Array<{ id: string; text: string; trigger: string }>;
    list_title?: string;
    list_button?: string;
    sections?: Array<{
      title: string;
      items: Array<{ id: string; title: string; description?: string; trigger: string }>;
    }>;
  };
  contact_filter: string;
  cooldown_mode: string;
  cooldown_hours: number;
  is_active: boolean;
  is_global_trigger: boolean;
  priority: number;
}

interface ChatbotFlow {
  id: string;
  seller_id: string;
  name: string;
  is_active: boolean;
  is_main_menu: boolean;
}

interface ChatbotFlowNode {
  id: string;
  flow_id: string;
  seller_id: string;
  parent_node_id: string | null;
  option_number: string;
  title: string;
  description: string | null;
  response_type: string;
  response_content: {
    text: string;
    image_url?: string;
  };
  template_id: string | null;
  sort_order: number;
  is_active: boolean;
}

interface ChatbotFlowSession {
  id: string;
  seller_id: string;
  contact_phone: string;
  current_flow_id: string | null;
  current_node_id: string | null;
  is_active: boolean;
  awaiting_human: boolean;
}

interface ChatbotContact {
  id: string;
  seller_id: string;
  phone: string;
  contact_status: string;
  last_response_at: string | null;
  last_buttons_sent_at: string | null;
  last_list_sent_at: string | null;
  interaction_count: number;
}

interface ChatbotSettings {
  is_enabled: boolean;
  response_delay_min: number;
  response_delay_max: number;
  ignore_groups: boolean;
  ignore_own_messages: boolean;
  typing_enabled: boolean;
  typing_duration_min: number;
  typing_duration_max: number;
}

interface GlobalConfig {
  api_url: string;
  api_token: string;
  is_active: boolean;
}

interface AdminChatbotNode {
  id: string;
  node_key: string;
  title: string;
  content: string;
  parent_key: string | null;
  options: Array<{ key: string; label: string; target: string }>;
  response_type: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string;
}

interface AdminChatbotContact {
  id: string;
  phone: string;
  name: string | null;
  current_node_key: string;
  last_response_at: string | null;
  last_interaction_at: string | null;
  interaction_count: number;
}

interface SellerChatbotVariable {
  variable_key: string;
  variable_value: string;
}

// ========== HELPER FUNCTIONS ==========

/**
 * Replace dynamic variables in text with seller-specific values
 * Supports: {empresa}, {pix}, {whatsapp}, and any custom variables
 */
function replaceVariables(text: string, variables: SellerChatbotVariable[]): string {
  if (!text || !variables || variables.length === 0) return text;
  
  let result = text;
  for (const variable of variables) {
    const regex = new RegExp(`\\{${variable.variable_key}\\}`, 'gi');
    result = result.replace(regex, variable.variable_value || '');
  }
  return result;
}

async function getOrCreateAdminContact(
  supabase: any,
  phone: string,
  pushName: string
): Promise<AdminChatbotContact | null> {
  try {
    let { data: contact } = await supabase
      .from("admin_chatbot_contacts")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error } = await supabase
        .from("admin_chatbot_contacts")
        .insert({
          phone,
          name: pushName,
          current_node_key: "inicial",
          interaction_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating admin contact:", error);
        return null;
      }
      contact = newContact;
    }

    return contact;
  } catch (error) {
    console.error("[getOrCreateAdminContact] Error:", error);
    return null;
  }
}

/**
 * Check if we can respond to an admin chatbot message.
 * 
 * NEW LOGIC:
 * - Cooldown (12h, 6h, 24h) ONLY applies to the FIRST initial message of a new conversation
 * - When user is navigating the flow (numbers 1,2,3, etc.) or returning with "*", 
 *   cooldown is BYPASSED and bot responds immediately
 * - Cooldown is reset when user starts a completely NEW conversation (first message after cooldown period)
 * 
 * @param isFlowNavigation - true if user is navigating flow (numbers) or returning to menu (*)
 */
function canRespondAdmin(
  contact: AdminChatbotContact | null,
  responseMode: string,
  now: Date,
  isFlowNavigation: boolean = false
): { canSend: boolean; reason?: string } {
  // If navigating within flow or returning to menu, ALWAYS allow response
  if (isFlowNavigation) {
    return { canSend: true };
  }

  // "always" mode = no restrictions
  if (responseMode === "always") {
    return { canSend: true };
  }

  // First ever contact = allow
  if (!contact?.last_response_at) {
    return { canSend: true };
  }

  const lastResponse = new Date(contact.last_response_at);
  const hoursSinceLastResponse = (now.getTime() - lastResponse.getTime()) / (1000 * 60 * 60);

  // Cooldown check ONLY for initial messages (not flow navigation)
  if (responseMode === "6h" && hoursSinceLastResponse < 6) {
    return { canSend: false, reason: "Cooldown 6h ainda ativo" };
  }

  if (responseMode === "12h" && hoursSinceLastResponse < 12) {
    return { canSend: false, reason: "Cooldown 12h ainda ativo" };
  }

  if (responseMode === "24h" && hoursSinceLastResponse < 24) {
    return { canSend: false, reason: "Cooldown 24h ainda ativo" };
  }

  return { canSend: true };
}

/**
 * Detect if user input is a flow navigation command
 * - Numbers (1, 2, 3, etc.) = navigating menu options
 * - "*", "voltar", "menu", "0" = returning to main menu
 * - Emoji numbers (1️⃣, 2️⃣, etc.) = navigating menu options
 */
function isFlowNavigationInput(input: string): boolean {
  const normalizedInput = input.toLowerCase().trim();
  
  // Return to menu commands
  if (["*", "voltar", "menu", "0"].includes(normalizedInput)) {
    return true;
  }
  
  // Pure number input (1, 2, 3, etc.)
  if (/^[0-9]+$/.test(normalizedInput)) {
    return true;
  }
  
  // Emoji numbers
  const emojiNumbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  if (emojiNumbers.some(e => normalizedInput.includes(e))) {
    return true;
  }
  
  // Text numbers
  const textNumbers = ["um", "dois", "tres", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  if (textNumbers.includes(normalizedInput)) {
    return true;
  }
  
  return false;
}

// Helper to find main/initial node
function findMainNode(nodes: AdminChatbotNode[]): AdminChatbotNode | null {
  // Priority 1: node_key === "inicial"
  const inicial = nodes.find(n => n.node_key === "inicial");
  if (inicial) return inicial;
  
  // Priority 2: node with parent_key === null (root node)
  const rootNode = nodes.find(n => n.parent_key === null);
  if (rootNode) return rootNode;
  
  // Priority 3: first node with lowest sort_order
  const sorted = [...nodes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return sorted[0] || null;
}

function processAdminInput(
  currentNodeKey: string,
  input: string,
  nodes: AdminChatbotNode[]
): { nextNode: AdminChatbotNode | null; message: string } {
  // Guard against empty nodes array
  if (!nodes || nodes.length === 0) {
    return { nextNode: null, message: "" };
  }

  const normalizedInput = input.toLowerCase().trim();
  
  // Get main node (inicial or first available)
  const mainNode = findMainNode(nodes);

  // Check for return to main menu
  if (normalizedInput === "*" || normalizedInput === "voltar" || normalizedInput === "menu" || normalizedInput === "0") {
    return { nextNode: mainNode, message: mainNode?.content || "" };
  }

  const currentNode = nodes.find(n => n.node_key === currentNodeKey);
  if (!currentNode) {
    return { nextNode: mainNode, message: mainNode?.content || "" };
  }

  // Input mappings for emoji numbers and text
  const inputMappings: Record<string, string> = {
    "1️⃣": "1", "um": "1", "one": "1",
    "2️⃣": "2", "dois": "2", "two": "2",
    "3️⃣": "3", "tres": "3", "três": "3", "three": "3",
    "4️⃣": "4", "quatro": "4", "four": "4",
    "5️⃣": "5", "cinco": "5", "five": "5",
    "6️⃣": "6", "seis": "6", "six": "6",
    "7️⃣": "7", "sete": "7", "seven": "7",
    "8️⃣": "8", "oito": "8", "eight": "8",
    "9️⃣": "9", "nove": "9", "nine": "9",
  };

  let normalizedKey = normalizedInput;
  for (const [key, value] of Object.entries(inputMappings)) {
    if (normalizedInput === key || normalizedInput.includes(key)) {
      normalizedKey = value;
      break;
    }
  }

  // Guard against undefined options
  const options = currentNode.options || [];
  const matchedOption = options.find(opt => opt.key === normalizedKey);
  
  if (matchedOption && matchedOption.target) {
    const targetNode = nodes.find(n => n.node_key === matchedOption.target);
    if (targetNode) {
      return { nextNode: targetNode, message: targetNode.content };
    }
  }

  // No valid option found - return empty to indicate silence
  return {
    nextNode: null,
    message: ""
  };
}

async function processAdminChatbotMessage(
  supabase: any,
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  messageText: string,
  pushName: string
): Promise<{ status: string; reason?: string; sent?: boolean }> {
  try {
    // Get admin chatbot settings
    const { data: enabledSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admin_chatbot_enabled")
      .maybeSingle();

    const isEnabled = enabledSetting?.value === "true";
    if (!isEnabled) {
      return { status: "ignored", reason: "Admin chatbot disabled" };
    }

    // Get response mode
    const { data: modeSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admin_chatbot_response_mode")
      .maybeSingle();

    const responseMode = modeSetting?.value || "24h";

    // Get chatbot delay settings
    const { data: delayMinSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admin_chatbot_delay_min")
      .maybeSingle();

    const { data: delayMaxSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admin_chatbot_delay_max")
      .maybeSingle();

    const { data: typingSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "admin_chatbot_typing_enabled")
      .maybeSingle();

    const delayMin = parseInt(delayMinSetting?.value || "2");
    const delayMax = parseInt(delayMaxSetting?.value || "5");
    const typingEnabled = typingSetting?.value !== "false";

    // Get or create contact
    const contact = await getOrCreateAdminContact(supabase, phone, pushName);
    if (!contact) {
      return { status: "error", reason: "Failed to get/create contact" };
    }

    // Detect if user is navigating the flow (numbers, *, voltar, etc.)
    const isFlowNav = isFlowNavigationInput(messageText);
    
    // Check cooldown - ONLY blocks if NOT navigating flow
    const now = new Date();
    const cooldownCheck = canRespondAdmin(contact, responseMode, now, isFlowNav);
    if (!cooldownCheck.canSend) {
      console.log("[AdminChatbot] Cooldown active (initial message only):", cooldownCheck.reason);
      return { status: "blocked", reason: cooldownCheck.reason };
    }
    
    if (isFlowNav) {
      console.log("[AdminChatbot] Flow navigation detected, bypassing cooldown");
    }

    // Get all chatbot nodes
    const { data: nodes, error: nodesError } = await supabase
      .from("admin_chatbot_config")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (nodesError) {
      console.error("[AdminChatbot] Error fetching nodes:", nodesError);
      return { status: "error", reason: "Failed to fetch chatbot config" };
    }

    if (!nodes || nodes.length === 0) {
      return { status: "ignored", reason: "No chatbot nodes configured" };
    }

    // Check for keyword match first
    const { data: keywords } = await supabase
      .from("admin_chatbot_keywords")
      .select("*")
      .eq("is_active", true);

    const normalizedInput = messageText.toLowerCase().trim();
    const matchedKeyword = keywords?.find((kw: any) => 
      normalizedInput === kw.keyword.toLowerCase().trim()
    );

    // Find the main node for this chatbot
    const mainNode = findMainNode(nodes as AdminChatbotNode[]);
    const mainNodeKey = mainNode?.node_key || "inicial";
    
    let responseMessage = "";
    let responseImageUrl = "";
    let newNodeKey = contact.current_node_key || mainNodeKey;

    if (matchedKeyword) {
      responseMessage = matchedKeyword.response_text;
      responseImageUrl = matchedKeyword.image_url || "";
      console.log("[AdminChatbot] Keyword match found");
    } else {
      const currentNodeKey = contact.current_node_key || mainNodeKey;
      const result = processAdminInput(currentNodeKey, messageText, nodes as AdminChatbotNode[]);

      responseMessage = result.message;

      if (result.nextNode) {
        newNodeKey = result.nextNode.node_key;
        responseImageUrl = result.nextNode.image_url || "";
      } else if (!responseMessage && mainNode) {
        // If no match found and this is a new contact, show main menu
        if (!contact.current_node_key || contact.current_node_key === mainNodeKey) {
          responseMessage = mainNode.content;
          newNodeKey = mainNode.node_key;
          responseImageUrl = mainNode.image_url || "";
        }
      }
    }

    // If no valid response (empty message), ignore silently
    if (!responseMessage || responseMessage.trim() === "") {
      console.log("[AdminChatbot] No valid response, ignoring message silently");
      return { status: "ignored", reason: "Invalid option - silent mode" };
    }

    // Send typing status if enabled
    if (typingEnabled) {
      const typingDuration = getRandomDelay(delayMin, delayMax);
      await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
    } else {
      const delay = getRandomDelay(delayMin, delayMax);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Validate connection BEFORE sending
    const connectionCheck = await validateApiConnection(globalConfig, instanceName);
    if (!connectionCheck.connected) {
      console.error("[AdminChatbot] Instance not connected:", connectionCheck.error);
      // Log the error but don't block - try to send anyway
    }

    // Send response (with image if provided)
    let sent = false;
    if (responseImageUrl) {
      sent = await sendImageMessage(globalConfig, instanceName, phone, responseMessage, responseImageUrl);
    } else {
      sent = await sendTextMessage(globalConfig, instanceName, phone, responseMessage, supabase, undefined);
    }

    if (sent) {
      // Update contact
      await supabase
        .from("admin_chatbot_contacts")
        .update({
          current_node_key: newNodeKey,
          last_response_at: now.toISOString(),
          last_interaction_at: now.toISOString(),
          interaction_count: (contact.interaction_count || 0) + 1,
          name: pushName || contact.name,
        })
        .eq("id", contact.id);

      // Log interaction
      await supabase.from("admin_chatbot_interactions").insert({
        phone,
        incoming_message: messageText,
        response_sent: responseMessage,
        node_key: newNodeKey,
      });
    }

    return { status: sent ? "sent" : "failed", sent };
  } catch (error: any) {
    console.error("[processAdminChatbotMessage] Error:", error);
    return { status: "error", reason: error.message };
  }
}

function extractPhone(remoteJid: string): string {
  return remoteJid.split("@")[0].replace(/\D/g, "");
}

function isGroupMessage(remoteJid: string): boolean {
  return remoteJid.includes("@g.us");
}

function extractMessageText(message: IncomingMessage["message"]): string | null {
  if (!message) return null;
  
  if (message.audioMessage || message.videoMessage || message.stickerMessage) {
    return null;
  }
  
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  if (message.buttonsResponseMessage?.selectedButtonId) {
    return `__BUTTON__:${message.buttonsResponseMessage.selectedButtonId}`;
  }
  
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return `__LIST__:${message.listResponseMessage.singleSelectReply.selectedRowId}`;
  }
  
  return null;
}

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

/**
 * Check if we can respond to a seller chatbot message.
 * 
 * NEW LOGIC (same as admin):
 * - Cooldown ONLY applies to the FIRST initial message of a new conversation
 * - When user is navigating the flow (numbers 1,2,3, etc.) or returning with "*", 
 *   cooldown is BYPASSED and bot responds immediately
 * 
 * @param isFlowNavigation - true if user is navigating flow (numbers) or returning to menu (*)
 */
function canRespond(
  contact: ChatbotContact | null,
  rule: ChatbotRule,
  now: Date,
  isFlowNavigation: boolean = false
): { canSend: boolean; reason?: string } {
  // If navigating within flow or returning to menu, ALWAYS allow response
  if (isFlowNavigation) {
    return { canSend: true };
  }

  if (rule.cooldown_mode === "free") {
    return { canSend: true };
  }
  
  if (!contact?.last_response_at) {
    return { canSend: true };
  }
  
  const lastResponse = new Date(contact.last_response_at);
  const hoursSinceLastResponse = (now.getTime() - lastResponse.getTime()) / (1000 * 60 * 60);
  
  if (rule.cooldown_mode === "polite" && hoursSinceLastResponse < 24) {
    return { canSend: false, reason: "Cooldown 24h ainda ativo" };
  }
  
  if (rule.cooldown_mode === "moderate" && hoursSinceLastResponse < rule.cooldown_hours) {
    return { canSend: false, reason: `Cooldown ${rule.cooldown_hours}h ainda ativo` };
  }
  
  return { canSend: true };
}

function canSendInteractiveContent(
  contact: ChatbotContact | null,
  responseType: string,
  now: Date
): boolean {
  if (!contact) return true;
  
  if (responseType === "text_buttons" && contact.last_buttons_sent_at) {
    const lastSent = new Date(contact.last_buttons_sent_at);
    const hoursSince = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  }
  
  if (responseType === "text_list" && contact.last_list_sent_at) {
    const lastSent = new Date(contact.last_list_sent_at);
    const hoursSince = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  }
  
  return true;
}

function findMatchingRule(
  rules: ChatbotRule[],
  messageText: string,
  contactStatus: string
): ChatbotRule | null {
  if (!rules || rules.length === 0) return null;
  
  const lowerMessage = messageText.toLowerCase().trim();
  
  if (lowerMessage.startsWith("__button__:") || lowerMessage.startsWith("__list__:")) {
    const triggerId = lowerMessage.split(":")[1];
    
    for (const rule of rules) {
      if (rule.trigger_text.toLowerCase() === triggerId.toLowerCase()) {
        if (rule.contact_filter === "ALL" || rule.contact_filter === contactStatus) {
          return rule;
        }
      }
    }
    return null;
  }
  
  const sortedRules = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.is_global_trigger !== b.is_global_trigger) return a.is_global_trigger ? 1 : -1;
    return 0;
  });
  
  for (const rule of sortedRules) {
    if (rule.is_global_trigger) continue;
    
    if (rule.contact_filter !== "ALL" && rule.contact_filter !== contactStatus) {
      continue;
    }
    
    const triggerLower = rule.trigger_text.toLowerCase().trim();
    
    if (lowerMessage === triggerLower || lowerMessage.includes(triggerLower)) {
      return rule;
    }
  }
  
  for (const rule of sortedRules) {
    if (!rule.is_global_trigger) continue;
    
    if (rule.contact_filter !== "ALL" && rule.contact_filter !== contactStatus) {
      continue;
    }
    
    if (rule.trigger_text === "*" || rule.trigger_text === "**" || rule.trigger_text === "***") {
      return rule;
    }
  }
  
  return null;
}

async function getFlowSession(
  supabase: any,
  sellerId: string,
  phone: string
): Promise<ChatbotFlowSession | null> {
  try {
    const { data } = await supabase
      .from("chatbot_flow_sessions")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("contact_phone", phone)
      .eq("is_active", true)
      .maybeSingle();

    return data;
  } catch (error) {
    console.error("[getFlowSession] Error:", error);
    return null;
  }
}

function buildFlowMenuText(nodes: ChatbotFlowNode[], headerText?: string): string {
  const sortedNodes = [...nodes].sort((a, b) => a.sort_order - b.sort_order);
  
  let menuText = headerText || "Escolha uma opção:\n\n";
  
  sortedNodes.forEach((node) => {
    if (node.is_active) {
      menuText += `*${node.option_number}* - ${node.title}\n`;
    }
  });
  
  menuText += "\n_Responda com o número da opção desejada._";
  
  return menuText;
}

function findNodeByOption(
  nodes: ChatbotFlowNode[],
  optionNumber: string,
  parentNodeId: string | null
): ChatbotFlowNode | null {
  if (!nodes || nodes.length === 0) return null;
  
  const cleanOption = optionNumber.trim();
  
  if (cleanOption === "0" || cleanOption.toLowerCase() === "voltar") {
    return null;
  }
  
  return nodes.find(
    (n) => 
      n.is_active && 
      n.parent_node_id === parentNodeId && 
      n.option_number === cleanOption
  ) || null;
}

async function processFlowNode(
  supabase: any,
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  node: ChatbotFlowNode,
  allNodes: ChatbotFlowNode[],
  session: ChatbotFlowSession,
  sellerId: string,
  chatbotSettings: ChatbotSettings
): Promise<{ sent: boolean; endSession: boolean; awaitHuman: boolean }> {
  try {
    if (chatbotSettings.typing_enabled) {
      const typingDuration = getRandomDelay(
        chatbotSettings.typing_duration_min,
        chatbotSettings.typing_duration_max
      );
      await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
    }

    switch (node.response_type) {
      case "text":
      case "text_image": {
        let sent = false;
        if (node.response_type === "text_image" && node.response_content?.image_url) {
          sent = await sendImageMessage(
            globalConfig,
            instanceName,
            phone,
            node.response_content.text || "",
            node.response_content.image_url
          );
        } else {
          sent = await sendTextMessage(
            globalConfig,
            instanceName,
            phone,
            node.response_content?.text || "",
            supabase,
            sellerId
          );
        }
        return { sent, endSession: false, awaitHuman: false };
      }

      case "submenu": {
        const childNodes = allNodes.filter(
          (n) => n.parent_node_id === node.id && n.is_active
        );
        
        if (childNodes.length === 0) {
          const sent = await sendTextMessage(
            globalConfig,
            instanceName,
            phone,
            node.response_content?.text || "",
            supabase,
            sellerId
          );
          return { sent, endSession: false, awaitHuman: false };
        }

        const menuText = buildFlowMenuText(childNodes, (node.response_content?.text || "") + "\n\n");
        const menuWithBack = menuText + "\n*0* - Voltar ao menu anterior";
        
        const sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          menuWithBack,
          supabase,
          sellerId
        );

        await supabase
          .from("chatbot_flow_sessions")
          .update({
            current_node_id: node.id,
            last_interaction_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        return { sent, endSession: false, awaitHuman: false };
      }

      case "template": {
        if (node.template_id) {
          const { data: template } = await supabase
            .from("chatbot_templates")
            .select("response_content, response_type")
            .eq("id", node.template_id)
            .maybeSingle();

          if (template) {
            const sent = await sendTextMessage(
              globalConfig,
              instanceName,
              phone,
              template.response_content?.text || node.response_content?.text || "",
              supabase,
              sellerId
            );
            return { sent, endSession: false, awaitHuman: false };
          }
        }
        
        const sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content?.text || "",
          supabase,
          sellerId
        );
        return { sent, endSession: false, awaitHuman: false };
      }

      case "human_transfer": {
        const sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content?.text || "Aguarde, você será atendido por um de nossos atendentes.",
          supabase,
          sellerId
        );

        await supabase
          .from("chatbot_flow_sessions")
          .update({
            awaiting_human: true,
            last_interaction_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        return { sent, endSession: false, awaitHuman: true };
      }

      case "end_chat": {
        const sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content?.text || "Obrigado pelo contato! Até a próxima.",
          supabase,
          sellerId
        );

        await supabase
          .from("chatbot_flow_sessions")
          .update({
            is_active: false,
            last_interaction_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        return { sent, endSession: true, awaitHuman: false };
      }

      default:
        return { sent: false, endSession: false, awaitHuman: false };
    }
  } catch (error) {
    console.error("[processFlowNode] Error:", error);
    return { sent: false, endSession: false, awaitHuman: false };
  }
}

function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, "");
  cleanUrl = cleanUrl.replace(/\/+$/, "");
  return cleanUrl;
}

function formatPhone(phone: string): string {
  let formatted = (phone || "").replace(/\D/g, "");

  if (formatted.startsWith("55")) return formatted;

  if (formatted.length === 10 || formatted.length === 11) {
    return `55${formatted}`;
  }

  return formatted;
}

async function auditWebhook(
  supabase: any,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("security_audit_log").insert({
      action: "chatbot_webhook",
      table_name: "chatbot_webhook",
      record_id: (payload.instanceName as string | undefined) ?? null,
      new_data: payload,
    });
  } catch (e) {
    // Silent fail for audit - don't break main flow
  }
}

async function sendTypingStatus(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  durationMs: number
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    
    const endpoints = [
      `${baseUrl}/chat/sendPresence/${instanceName}`,
      `${baseUrl}/message/sendPresence/${instanceName}`,
      `${baseUrl}/chat/presence/${instanceName}`,
    ];

    let sent = false;
    
    for (const url of endpoints) {
      try {
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: globalConfig.api_token,
          },
          body: JSON.stringify({
            number: formattedPhone,
            presence: "composing",
            delay: durationMs,
          }),
        }, 5000); // 5s timeout for typing

        if (response.ok) {
          sent = true;
          break;
        }
      } catch (e) {
        // Try next endpoint
      }
    }

    if (sent) {
      await new Promise((resolve) => setTimeout(resolve, durationMs));
    }

    return sent;
  } catch (error) {
    console.error("[sendTypingStatus] Error:", error);
    return false;
  }
}

async function validateApiConnection(
  globalConfig: GlobalConfig,
  instanceName: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const url = `${baseUrl}/instance/connectionState/${instanceName}`;

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        apikey: globalConfig.api_token,
      },
    }, 10000);

    if (!response.ok) {
      const errorText = await response.text();
      return { connected: false, error: `API retornou ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const state = data?.instance?.state || data?.state || data?.connectionState;
    
    if (state === "open" || state === "connected") {
      return { connected: true };
    }

    return { connected: false, error: `Instância não conectada: ${state}` };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { connected: false, error: "Timeout ao verificar conexão" };
    }
    return { connected: false, error: error.message };
  }
}

async function logSendAttempt(
  supabase: any,
  sellerId: string,
  phone: string,
  instanceName: string,
  messageType: string,
  success: boolean,
  statusCode?: number,
  apiResponse?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("chatbot_send_logs").insert({
      seller_id: sellerId,
      contact_phone: phone,
      instance_name: instanceName,
      message_type: messageType,
      success,
      api_status_code: statusCode,
      api_response: apiResponse?.substring(0, 1000),
      error_message: errorMessage,
    });
  } catch (e) {
    // Silent fail
  }
}

async function sendTextMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string,
  supabase?: any,
  sellerId?: string
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    const url = `${baseUrl}/message/sendText/${instanceName}`;

    console.log(`[sendTextMessage] Sending to ${formattedPhone} via ${instanceName}`);

    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text,
      }),
    });

    const responseText = await response.text();
    
    // Log detailed error for 400
    if (response.status === 400) {
      console.error(`[sendTextMessage] BAD REQUEST (400) - Instance: ${instanceName}, Phone: ${formattedPhone}, Response: ${responseText}`);
    }
    
    if (supabase && sellerId) {
      await logSendAttempt(
        supabase,
        sellerId,
        phone,
        instanceName,
        "text",
        response.ok,
        response.status,
        responseText,
        response.ok ? undefined : `Falha ao enviar: ${response.statusText}`
      );
    }
    
    return response.ok;
  } catch (error: any) {
    console.error("[sendTextMessage] Error:", error);
    
    if (supabase && sellerId) {
      await logSendAttempt(
        supabase,
        sellerId,
        phone,
        instanceName,
        "text",
        false,
        undefined,
        undefined,
        error.message
      );
    }
    
    return false;
  }
}

async function sendImageMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string,
  imageUrl: string
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    const url = `${baseUrl}/message/sendMedia/${instanceName}`;

    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        mediatype: "image",
        media: imageUrl,
        caption: text,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("[sendImageMessage] Error:", error);
    return false;
  }
}

async function sendButtonsMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string,
  buttons: Array<{ id: string; text: string }>
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    
    const buttonsUrl = `${baseUrl}/message/sendButtons/${instanceName}`;
    
    const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
      type: "reply",
      reply: {
        id: btn.id || `btn_${index}`,
        title: btn.text.slice(0, 20)
      }
    }));
    
    const response = await fetchWithRetry(buttonsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: text,
        buttons: formattedButtons,
      }),
    });
    
    if (response.ok) {
      return true;
    }
    
    // Try interactive format
    const interactiveUrl = `${baseUrl}/message/sendWhatsAppInteractive/${instanceName}`;
    
    const interactivePayload = {
      number: formattedPhone,
      interactive: {
        type: "button",
        body: {
          text: text
        },
        action: {
          buttons: buttons.slice(0, 3).map((btn, index) => ({
            type: "reply",
            reply: {
              id: btn.id || `btn_${index}`,
              title: btn.text.slice(0, 20)
            }
          }))
        }
      }
    };
    
    const interactiveResponse = await fetchWithRetry(interactiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify(interactivePayload),
    });
    
    if (interactiveResponse.ok) {
      return true;
    }
    
    // Fallback to text with emoji buttons
    const textWithButtons = `${text}\n\n${buttons.map((btn, i) => `${i + 1}️⃣ ${btn.text}`).join('\n')}\n\n_Responda com o número da opção desejada._`;
    
    return await sendTextMessage(globalConfig, instanceName, phone, textWithButtons);
  } catch (error) {
    console.error("[sendButtonsMessage] Error:", error);
    return false;
  }
}

async function sendListMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string,
  buttonText: string,
  sections: Array<{
    title: string;
    items: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    
    const listUrl = `${baseUrl}/message/sendList/${instanceName}`;
    
    const formattedSections = sections.map((section) => ({
      title: section.title.slice(0, 24),
      rows: section.items.slice(0, 10).map((item) => ({
        rowId: item.id,
        title: item.title.slice(0, 24),
        description: (item.description || "").slice(0, 72),
      })),
    }));
    
    const response = await fetchWithRetry(listUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        title: "Menu",
        description: text,
        buttonText: buttonText.slice(0, 20),
        footerText: "",
        sections: formattedSections,
      }),
    });
    
    if (response.ok) {
      return true;
    }
    
    // Try interactive list format
    const interactiveUrl = `${baseUrl}/message/sendWhatsAppInteractive/${instanceName}`;
    
    const interactivePayload = {
      number: formattedPhone,
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "Menu"
        },
        body: {
          text: text
        },
        action: {
          button: buttonText.slice(0, 20),
          sections: formattedSections.map(section => ({
            title: section.title,
            rows: section.rows
          }))
        }
      }
    };
    
    const interactiveResponse = await fetchWithRetry(interactiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify(interactivePayload),
    });
    
    if (interactiveResponse.ok) {
      return true;
    }
    
    // Fallback to text with numbered list
    let textWithList = `${text}\n\n📋 *Opções disponíveis:*\n`;
    sections.forEach(section => {
      textWithList += `\n*${section.title}*\n`;
      section.items.forEach((item, i) => {
        textWithList += `${i + 1}. ${item.title}${item.description ? ` - ${item.description}` : ''}\n`;
      });
    });
    textWithList += '\n_Responda com o nome ou número da opção desejada._';
    
    return await sendTextMessage(globalConfig, instanceName, phone, textWithList);
  } catch (error) {
    console.error("[sendListMessage] Error:", error);
    return false;
  }
}

// ========== MAIN HANDLER ==========
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Diagnostic endpoint
    if (req.method === "GET") {
      let rawUrl = req.url;
      if (rawUrl.includes("%3F")) {
        rawUrl = rawUrl.replace(/%3F/g, "?").replace(/%26/g, "&").replace(/%3D/g, "=");
      }
      
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        parsedUrl = new URL(rawUrl, "https://placeholder.co");
      }

      const ping = parsedUrl.searchParams.get("ping");
      if (ping === "true") {
        return new Response(
          JSON.stringify({ 
            status: "ok", 
            message: "Chatbot webhook is online",
            timestamp: new Date().toISOString(),
            version: "2.2.0",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Full diagnostic mode
      const diagnose = parsedUrl.searchParams.get("diagnose");
      if (diagnose === "true") {
        try {
          // Check global config
          const { data: globalConfig, error: globalError } = await supabase
            .from("whatsapp_global_config")
            .select("id, instance_name, is_active, api_url")
            .eq("is_active", true)
            .maybeSingle();

          // Check admin chatbot config
          const { data: adminNodes, error: adminError } = await supabase
            .from("admin_chatbot_config")
            .select("id, node_key, title, is_active")
            .eq("is_active", true)
            .limit(10);

          // Check admin chatbot enabled setting
          const { data: enabledSetting } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", "admin_chatbot_enabled")
            .maybeSingle();

          // Check seller instances
          const { data: sellerInstances, error: sellerError } = await supabase
            .from("whatsapp_seller_instances")
            .select("seller_id, instance_name, is_connected, instance_blocked")
            .limit(10);

          // Check chatbot rules count
          const { count: rulesCount } = await supabase
            .from("chatbot_rules")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);

          // Check chatbot flows count
          const { count: flowsCount } = await supabase
            .from("chatbot_flows")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);

          return new Response(
            JSON.stringify({
              status: "diagnostic",
              version: "2.2.0",
              timestamp: new Date().toISOString(),
              globalConfig: globalConfig ? {
                hasConfig: true,
                instanceName: globalConfig.instance_name || "[NOT SET]",
                isActive: globalConfig.is_active,
                hasApiUrl: !!globalConfig.api_url,
              } : { hasConfig: false, error: globalError?.message },
              adminChatbot: {
                enabled: enabledSetting?.value === "true",
                nodesCount: adminNodes?.length || 0,
                hasInitialNode: adminNodes?.some((n: any) => n.node_key === "inicial") || false,
              },
              sellerInstances: {
                count: sellerInstances?.length || 0,
                instances: sellerInstances?.map((i: any) => ({
                  name: i.instance_name,
                  connected: i.is_connected,
                  blocked: i.instance_blocked,
                })) || [],
              },
              chatbot: {
                activeRules: rulesCount || 0,
                activeFlows: flowsCount || 0,
              },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (diagError: any) {
          return new Response(
            JSON.stringify({
              status: "diagnostic_error",
              error: diagError.message,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Simplified diagnostic response
      return new Response(
        JSON.stringify({ 
          status: "ok",
          message: "Chatbot webhook ready",
          version: "2.2.0",
          usage: "Send POST with Evolution API webhook payload. Use ?diagnose=true for full diagnostic.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse webhook payload
    let rawPayload: RawWebhookPayload;
    try {
      rawPayload = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST diagnostic mode
    if ((rawPayload as any).action === "diagnose") {
      try {
        // Check global config
        const { data: globalConfig } = await supabase
          .from("whatsapp_global_config")
          .select("id, instance_name, is_active, api_url, api_token")
          .eq("is_active", true)
          .maybeSingle();

        // Check admin chatbot config
        const { data: adminNodes } = await supabase
          .from("admin_chatbot_config")
          .select("id, node_key, title, is_active, parent_key")
          .eq("is_active", true)
          .order("sort_order")
          .limit(20);

        // Check admin chatbot enabled setting
        const { data: enabledSetting } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "admin_chatbot_enabled")
          .maybeSingle();

        // Check seller instances
        const { data: sellerInstances } = await supabase
          .from("whatsapp_seller_instances")
          .select("seller_id, instance_name, is_connected, instance_blocked")
          .limit(10);

        // Check chatbot rules count
        const { count: rulesCount } = await supabase
          .from("chatbot_rules")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true);

        // Check chatbot flows count
        const { count: flowsCount } = await supabase
          .from("chatbot_flows")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true);

        // Check recent send logs for errors
        const { data: recentLogs } = await supabase
          .from("chatbot_send_logs")
          .select("success, error_message, api_status_code, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        // Test API connection if config exists
        let apiConnectionTest = null;
        if (globalConfig?.api_url && globalConfig?.api_token) {
          try {
            const testUrl = `${normalizeApiUrl(globalConfig.api_url)}/instance/fetchInstances`;
            const testResponse = await fetchWithTimeout(testUrl, {
              method: "GET",
              headers: { apikey: globalConfig.api_token },
            }, 8000);
            
            apiConnectionTest = {
              status: testResponse.status,
              ok: testResponse.ok,
              url: testUrl.replace(globalConfig.api_token, "[HIDDEN]"),
            };
          } catch (testError: any) {
            apiConnectionTest = {
              status: "error",
              message: testError.message,
            };
          }
        }

        // Find main node
        const mainNode = adminNodes?.find((n: any) => n.node_key === "inicial") ||
                        adminNodes?.find((n: any) => n.parent_key === null) ||
                        adminNodes?.[0];

        return new Response(
          JSON.stringify({
            status: "diagnostic",
            version: "2.3.0",
            timestamp: new Date().toISOString(),
            globalConfig: globalConfig ? {
              hasConfig: true,
              instanceName: globalConfig.instance_name || "[NOT SET]",
              isActive: globalConfig.is_active,
              hasApiUrl: !!globalConfig.api_url,
              hasApiToken: !!globalConfig.api_token,
            } : { hasConfig: false },
            apiConnectionTest,
            adminChatbot: {
              enabled: enabledSetting?.value === "true",
              nodesCount: adminNodes?.length || 0,
              hasInitialNode: !!adminNodes?.find((n: any) => n.node_key === "inicial"),
              mainNodeKey: mainNode?.node_key || "[NONE]",
              nodes: adminNodes?.map((n: any) => ({ key: n.node_key, parent: n.parent_key })) || [],
            },
            sellerInstances: {
              count: sellerInstances?.length || 0,
              instances: sellerInstances?.map((i: any) => ({
                name: i.instance_name,
                connected: i.is_connected,
                blocked: i.instance_blocked,
              })) || [],
            },
            chatbot: {
              activeRules: rulesCount || 0,
              activeFlows: flowsCount || 0,
            },
            recentSendLogs: recentLogs?.map((log: any) => ({
              success: log.success,
              error: log.error_message,
              status: log.api_status_code,
            })) || [],
            sellerMenus: await (async () => {
              // Check seller menus for each seller instance
              const menus: any[] = [];
              for (const inst of (sellerInstances || [])) {
                const { data: menuNodes } = await supabase
                  .from("seller_chatbot_menu")
                  .select("id, node_key, title")
                  .eq("seller_id", inst.seller_id)
                  .eq("is_active", true);
                
                const { data: settings } = await supabase
                  .from("seller_chatbot_settings")
                  .select("menu_enabled, response_mode")
                  .eq("seller_id", inst.seller_id)
                  .maybeSingle();
                
                menus.push({
                  sellerId: inst.seller_id?.substring(0, 8),
                  instanceName: inst.instance_name,
                  menuNodesCount: menuNodes?.length || 0,
                  hasInitialNode: menuNodes?.some((n: any) => n.node_key === "inicial") || false,
                  menuEnabled: settings?.menu_enabled ?? true,
                  responseMode: settings?.response_mode || "24h",
                });
              }
              return menus;
            })(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (diagError: any) {
        return new Response(
          JSON.stringify({
            status: "diagnostic_error",
            error: diagError.message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const payload = normalizeWebhookPayload(rawPayload);

    // Filter for message events
    const messageEvents = [
      "messages.upsert",
      "message",
      "message.received",
      "received",
      "incoming",
    ];
    
    const eventLower = (payload.event || "").toLowerCase();
    const isMessageEvent = messageEvents.some(e => eventLower.includes(e.toLowerCase()));

    if (!isMessageEvent) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Not a message event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = payload.data;
    if (!message?.key?.remoteJid) {
      return new Response(JSON.stringify({ status: "ignored", reason: "No message data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = (payload.instance || "").trim();
    if (!instanceName) {
      return new Response(JSON.stringify({ status: "ignored", reason: "No instance name" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remoteJid = message.key.remoteJid;
    const fromMeRaw: unknown = (message.key as any).fromMe;
    const fromMe =
      fromMeRaw === true ||
      fromMeRaw === 1 ||
      fromMeRaw === "1" ||
      (typeof fromMeRaw === "string" && fromMeRaw.toLowerCase().trim() === "true");
    const pushName = message.pushName || "";

    // Check for admin mode
    let rawUrl = req.url;
    if (rawUrl.includes("%3F")) {
      rawUrl = rawUrl.replace(/%3F/g, "?").replace(/%26/g, "&").replace(/%3D/g, "=");
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      parsedUrl = new URL(rawUrl, "https://placeholder.co");
    }
    const isAdminModeParam = parsedUrl.searchParams.get("admin") === "true";

    // Auto-detect admin instance
    let isAdminInstance = false;
    const currentInstanceLower = instanceName.toLowerCase().trim();
    const isSellerPrefixedInstance = currentInstanceLower.startsWith("seller_");
    
    if (!isAdminModeParam && !isSellerPrefixedInstance) {
      const { data: globalCfg } = await supabase
        .from("whatsapp_global_config")
        .select("instance_name, admin_user_id")
        .eq("is_active", true)
        .maybeSingle();
      
      if (globalCfg?.instance_name) {
        const globalInstanceLower = globalCfg.instance_name.toLowerCase().trim();
        if (globalInstanceLower === currentInstanceLower) {
          isAdminInstance = true;
        }
      }
      
      if (!isAdminInstance && !globalCfg?.instance_name) {
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        
        if (adminRoles && adminRoles.length > 0) {
          const adminUserIds = adminRoles.map(r => r.user_id);
          
          const { data: adminInstance } = await supabase
            .from("whatsapp_seller_instances")
            .select("seller_id, instance_name")
            .in("seller_id", adminUserIds)
            .ilike("instance_name", instanceName)
            .maybeSingle();
          
          if (adminInstance) {
            isAdminInstance = true;
          }
        }
      }
    }

    const isAdminMode = isAdminModeParam || isAdminInstance;

    // Process admin chatbot
    if (isAdminMode) {
      if (fromMe || isGroupMessage(remoteJid)) {
        return new Response(JSON.stringify({ status: "ignored", reason: "Own message or group" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const messageText = extractMessageText(message.message);
      if (!messageText) {
        return new Response(JSON.stringify({ status: "ignored", reason: "No text content" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = extractPhone(remoteJid);

      const { data: globalConfigData } = await supabase
        .from("whatsapp_global_config")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();

      if (!globalConfigData) {
        return new Response(JSON.stringify({ status: "ignored", reason: "API not active" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await processAdminChatbotMessage(
        supabase,
        globalConfigData as GlobalConfig,
        instanceName,
        phone,
        messageText,
        pushName
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Get global config for reseller
    const { data: globalConfigData } = await supabase
      .from("whatsapp_global_config")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    
    if (!globalConfigData) {
      return new Response(JSON.stringify({ status: "ignored", reason: "API not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const globalConfig: GlobalConfig = globalConfigData;
    
    // Find seller by instance - multiple strategies
    const instanceNameLower = instanceName.toLowerCase().trim();
    
    let { data: sellerInstance } = await supabase
      .from("whatsapp_seller_instances")
      .select("seller_id, is_connected, instance_blocked, instance_name, original_instance_name, plan_status")
      .ilike("instance_name", instanceName)
      .maybeSingle();
    
    if (!sellerInstance && instanceNameLower.startsWith("seller_")) {
      const { data: allInstances } = await supabase
        .from("whatsapp_seller_instances")
        .select("seller_id, is_connected, instance_blocked, instance_name, original_instance_name, plan_status");
      
      if (allInstances) {
        for (const inst of allInstances) {
          const expectedName = `seller_${inst.seller_id.replace(/-/g, '').substring(0, 8)}`;
          if (expectedName.toLowerCase() === instanceNameLower || 
              inst.instance_name?.toLowerCase() === instanceNameLower) {
            sellerInstance = inst;
            break;
          }
        }
      }
    }
    
    if (!sellerInstance) {
      const { data: byOriginal } = await supabase
        .from("whatsapp_seller_instances")
        .select("seller_id, is_connected, instance_blocked, instance_name, original_instance_name, plan_status")
        .ilike("original_instance_name", instanceName)
        .maybeSingle();
      
      if (byOriginal) {
        sellerInstance = byOriginal;
      }
    }
    
    if (!sellerInstance) {
      return new Response(
        JSON.stringify({ 
          status: "error", 
          reason: "Instance not found",
          instanceSearched: instanceName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (sellerInstance.instance_blocked) {
      return new Response(
        JSON.stringify({ 
          status: "blocked", 
          reason: "Instance blocked",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (sellerInstance.plan_status === "expired" || sellerInstance.plan_status === "suspended") {
      await supabase
        .from("whatsapp_seller_instances")
        .update({
          instance_blocked: true,
          blocked_at: new Date().toISOString(),
          blocked_reason: `Plano ${sellerInstance.plan_status}`,
        })
        .eq("seller_id", sellerInstance.seller_id);
      
      return new Response(
        JSON.stringify({ 
          status: "blocked", 
          reason: `Plan ${sellerInstance.plan_status}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const sellerId = sellerInstance.seller_id;
    
    // Get or create chatbot settings
    const { data: settings } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();
    
    if (!settings) {
      await supabase
        .from("chatbot_settings")
        .insert({
          seller_id: sellerId,
          is_enabled: true,
          ignore_groups: true,
          ignore_own_messages: true,
          typing_enabled: true,
        });
    }
    
    const chatbotSettings: ChatbotSettings = {
      is_enabled: settings?.is_enabled ?? true,
      response_delay_min: settings?.response_delay_min ?? 2,
      response_delay_max: settings?.response_delay_max ?? 5,
      ignore_groups: settings?.ignore_groups ?? true,
      ignore_own_messages: settings?.ignore_own_messages ?? true,
      typing_enabled: settings?.typing_enabled ?? true,
      typing_duration_min: settings?.typing_duration_min ?? 2,
      typing_duration_max: settings?.typing_duration_max ?? 5,
    };
    
    if (!chatbotSettings.is_enabled) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Chatbot disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Ignore groups if configured
    if (chatbotSettings.ignore_groups && isGroupMessage(remoteJid)) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Group message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Ignore own messages if configured
    if (chatbotSettings.ignore_own_messages && fromMe) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Own message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const messageText = extractMessageText(message.message);
    if (!messageText) {
      return new Response(JSON.stringify({ status: "ignored", reason: "No text content" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const phone = extractPhone(remoteJid);
    const now = new Date();
    
    // Get or create contact
    let { data: contact } = await supabase
      .from("chatbot_contacts")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("phone", phone)
      .maybeSingle();
    
    if (!contact) {
      const { data: newContact } = await supabase
        .from("chatbot_contacts")
        .insert({
          seller_id: sellerId,
          phone,
          contact_status: "NEW",
          name: pushName,
          first_interaction_at: now.toISOString(),
          interaction_count: 0,
        })
        .select()
        .single();
      
      contact = newContact;
    }
    
    const contactStatus = contact?.contact_status || "NEW";

    // ========== SELLER INTERACTIVE MENU (NEW SYSTEM) ==========
    // Fetch seller's variables for dynamic content
    let { data: sellerVariables } = await supabase
      .from("seller_chatbot_variables")
      .select("variable_key, variable_value")
      .eq("seller_id", sellerId);
    
    // If seller has no variables configured, get from profile
    if (!sellerVariables || sellerVariables.length === 0) {
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("company_name, pix_key, whatsapp")
        .eq("id", sellerId)
        .single();
      
      if (sellerProfile) {
        // Create default variables from profile data
        sellerVariables = [
          { variable_key: "empresa", variable_value: sellerProfile.company_name || "" },
          { variable_key: "pix", variable_value: sellerProfile.pix_key || "" },
          { variable_key: "whatsapp", variable_value: sellerProfile.whatsapp || "" },
          { variable_key: "horario", variable_value: "08:00 às 22:00" },
        ];
      }
    } else {
      // Enhance existing variables with profile data for empty values
      const { data: sellerProfile } = await supabase
        .from("profiles")
        .select("company_name, pix_key, whatsapp")
        .eq("id", sellerId)
        .single();
      
      if (sellerProfile) {
        const profileDefaults: Record<string, string> = {
          empresa: sellerProfile.company_name || "",
          pix: sellerProfile.pix_key || "",
          whatsapp: sellerProfile.whatsapp || "",
        };
        
        sellerVariables = sellerVariables.map(v => ({
          ...v,
          variable_value: v.variable_value || profileDefaults[v.variable_key] || "",
        }));
      }
    }
    
    const variables: SellerChatbotVariable[] = sellerVariables || [];
    
    // Check if seller has the new interactive menu configured
    const { data: sellerMenuSettings } = await supabase
      .from("seller_chatbot_settings")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();
    
    const { data: sellerMenuNodes } = await supabase
      .from("seller_chatbot_menu")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("is_active", true)
      .order("sort_order");
    
    // Get or create seller chatbot contact for the new menu system
    let { data: sellerMenuContact } = await supabase
      .from("seller_chatbot_contacts")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("phone", phone)
      .maybeSingle();
    
    // Process with new interactive menu if available
    // Check menu_enabled (new field) or is_enabled (legacy) - both default to true
    const menuEnabled = sellerMenuSettings?.menu_enabled !== false && sellerMenuSettings?.is_enabled !== false;
    
    if (sellerMenuNodes && sellerMenuNodes.length > 0 && menuEnabled) {
      // Create contact if not exists
      if (!sellerMenuContact) {
        const { data: newMenuContact } = await supabase
          .from("seller_chatbot_contacts")
          .insert({
            seller_id: sellerId,
            phone,
            name: pushName,
            current_node_key: "inicial",
            interaction_count: 0,
          })
          .select()
          .single();
        sellerMenuContact = newMenuContact;
      }
      
      // Get response mode from settings
      const responseMode = sellerMenuSettings?.response_mode || "24h";
      const isFlowNav = isFlowNavigationInput(messageText);
      
      // Check cooldown for seller menu (same logic as admin)
      // IMPORTANT: Cooldown only applies to FIRST initial message, NOT to navigation inputs
      const lastResponse = sellerMenuContact?.last_response_at ? new Date(sellerMenuContact.last_response_at) : null;
      let canSendMenuResponse = true;
      
      // Flow navigation inputs always bypass cooldown (numbers, *, voltar, menu)
      if (!isFlowNav && lastResponse && responseMode !== "always") {
        const hoursSinceLastResponse = (now.getTime() - lastResponse.getTime()) / (1000 * 60 * 60);
        
        if (responseMode === "6h" && hoursSinceLastResponse < 6) {
          canSendMenuResponse = false;
          console.log(`[SellerChatbot] Cooldown active (6h): ${hoursSinceLastResponse.toFixed(2)}h elapsed`);
        } else if (responseMode === "12h" && hoursSinceLastResponse < 12) {
          canSendMenuResponse = false;
          console.log(`[SellerChatbot] Cooldown active (12h): ${hoursSinceLastResponse.toFixed(2)}h elapsed`);
        } else if (responseMode === "24h" && hoursSinceLastResponse < 24) {
          canSendMenuResponse = false;
          console.log(`[SellerChatbot] Cooldown active (24h): ${hoursSinceLastResponse.toFixed(2)}h elapsed`);
        }
      }
      
      // If in cooldown but it's a navigation input, allow response
      if (!canSendMenuResponse && isFlowNav) {
        canSendMenuResponse = true;
        console.log(`[SellerChatbot] Navigation input bypasses cooldown: ${messageText}`);
      }
      
      if (canSendMenuResponse) {
        const normalizedInput = messageText.toLowerCase().trim();
        const currentNodeKey = sellerMenuContact?.current_node_key || "inicial";
        
        // Find main/initial node
        const findSellerMainNode = (nodes: any[]) => {
          const inicial = nodes.find(n => n.node_key === "inicial");
          if (inicial) return inicial;
          const rootNode = nodes.find(n => n.parent_key === null);
          if (rootNode) return rootNode;
          return nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))[0] || null;
        };
        
        const mainNode = findSellerMainNode(sellerMenuNodes);
        const mainNodeKey = mainNode?.node_key || "inicial";
        
        // Check for return to menu
        if (normalizedInput === "*" || normalizedInput === "voltar" || normalizedInput === "menu" || normalizedInput === "0") {
          if (mainNode) {
            const responseText = replaceVariables(mainNode.content || "", variables);
            
            if (chatbotSettings.typing_enabled) {
              const typingDuration = getRandomDelay(chatbotSettings.typing_duration_min, chatbotSettings.typing_duration_max);
              await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
            }
            
            let sent = false;
            if (mainNode.image_url) {
              sent = await sendImageMessage(globalConfig, instanceName, phone, responseText, mainNode.image_url);
            } else {
              sent = await sendTextMessage(globalConfig, instanceName, phone, responseText, supabase, sellerId);
            }
            
            if (sent && sellerMenuContact) {
              await supabase
                .from("seller_chatbot_contacts")
                .update({
                  current_node_key: mainNodeKey,
                  last_response_at: now.toISOString(),
                  last_interaction_at: now.toISOString(),
                  interaction_count: (sellerMenuContact.interaction_count || 0) + 1,
                })
                .eq("id", sellerMenuContact.id);
            }
            
            return new Response(
              JSON.stringify({ status: sent ? "sent" : "failed", type: "seller_menu_return" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        // Find current node
        const currentNode = sellerMenuNodes.find((n: any) => n.node_key === currentNodeKey);
        
        // Process option selection
        const inputMappings: Record<string, string> = {
          "1️⃣": "1", "um": "1", "2️⃣": "2", "dois": "2",
          "3️⃣": "3", "tres": "3", "três": "3", "4️⃣": "4", "quatro": "4",
          "5️⃣": "5", "cinco": "5", "6️⃣": "6", "seis": "6",
          "7️⃣": "7", "sete": "7", "8️⃣": "8", "oito": "8",
        };
        
        let normalizedKey = normalizedInput;
        for (const [key, value] of Object.entries(inputMappings)) {
          if (normalizedInput === key || normalizedInput.includes(key)) {
            normalizedKey = value;
            break;
          }
        }
        
        // Find matching option in current node's options
        const options = currentNode?.options || [];
        const matchedOption = options.find((opt: any) => opt.key === normalizedKey);
        
        if (matchedOption && matchedOption.target) {
          const targetNode = sellerMenuNodes.find((n: any) => n.node_key === matchedOption.target);
          if (targetNode) {
            const responseText = replaceVariables(targetNode.content || "", variables);
            
            if (chatbotSettings.typing_enabled) {
              const typingDuration = getRandomDelay(chatbotSettings.typing_duration_min, chatbotSettings.typing_duration_max);
              await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
            }
            
            let sent = false;
            if (targetNode.image_url) {
              sent = await sendImageMessage(globalConfig, instanceName, phone, responseText, targetNode.image_url);
            } else {
              sent = await sendTextMessage(globalConfig, instanceName, phone, responseText, supabase, sellerId);
            }
            
            if (sent && sellerMenuContact) {
              await supabase
                .from("seller_chatbot_contacts")
                .update({
                  current_node_key: targetNode.node_key,
                  last_response_at: now.toISOString(),
                  last_interaction_at: now.toISOString(),
                  interaction_count: (sellerMenuContact.interaction_count || 0) + 1,
                })
                .eq("id", sellerMenuContact.id);
            }
            
            return new Response(
              JSON.stringify({ status: sent ? "sent" : "failed", type: "seller_menu_option", node: targetNode.title }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        // Check for keyword match in seller keywords
        const { data: sellerKeywords } = await supabase
          .from("seller_chatbot_keywords")
          .select("*")
          .eq("seller_id", sellerId)
          .eq("is_active", true);
        
        const matchedKeyword = sellerKeywords?.find((kw: any) => 
          normalizedInput === kw.keyword.toLowerCase().trim()
        );
        
        if (matchedKeyword) {
          const responseText = replaceVariables(matchedKeyword.response_text || "", variables);
          
          if (chatbotSettings.typing_enabled) {
            const typingDuration = getRandomDelay(chatbotSettings.typing_duration_min, chatbotSettings.typing_duration_max);
            await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
          }
          
          let sent = false;
          if (matchedKeyword.image_url) {
            sent = await sendImageMessage(globalConfig, instanceName, phone, responseText, matchedKeyword.image_url);
          } else {
            sent = await sendTextMessage(globalConfig, instanceName, phone, responseText, supabase, sellerId);
          }
          
          if (sent && sellerMenuContact) {
            await supabase
              .from("seller_chatbot_contacts")
              .update({
                last_response_at: now.toISOString(),
                last_interaction_at: now.toISOString(),
                interaction_count: (sellerMenuContact.interaction_count || 0) + 1,
              })
              .eq("id", sellerMenuContact.id);
          }
          
          return new Response(
            JSON.stringify({ status: sent ? "sent" : "failed", type: "seller_keyword" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // No match found - show main menu if this is first interaction or contact is new
        if (!sellerMenuContact?.current_node_key || sellerMenuContact.current_node_key === mainNodeKey) {
          if (mainNode) {
            const responseText = replaceVariables(mainNode.content || "", variables);
            
            if (chatbotSettings.typing_enabled) {
              const typingDuration = getRandomDelay(chatbotSettings.typing_duration_min, chatbotSettings.typing_duration_max);
              await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
            }
            
            let sent = false;
            if (mainNode.image_url) {
              sent = await sendImageMessage(globalConfig, instanceName, phone, responseText, mainNode.image_url);
            } else {
              sent = await sendTextMessage(globalConfig, instanceName, phone, responseText, supabase, sellerId);
            }
            
            if (sent && sellerMenuContact) {
              await supabase
                .from("seller_chatbot_contacts")
                .update({
                  current_node_key: mainNodeKey,
                  last_response_at: now.toISOString(),
                  last_interaction_at: now.toISOString(),
                  interaction_count: (sellerMenuContact.interaction_count || 0) + 1,
                })
                .eq("id", sellerMenuContact.id);
            }
            
            return new Response(
              JSON.stringify({ status: sent ? "sent" : "failed", type: "seller_menu_initial" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        // Silent mode - invalid option, don't respond if not at main menu
        if (sellerMenuSettings?.silent_mode !== false) {
          console.log("[SellerChatbot] Invalid option, silent mode active");
          return new Response(
            JSON.stringify({ status: "ignored", reason: "Invalid option - silent mode" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }
    // ========== END SELLER INTERACTIVE MENU ==========

    // Check for active flow session (legacy system)
    const flowSession = await getFlowSession(supabase, sellerId, phone);
    
    if (flowSession && flowSession.is_active && !flowSession.awaiting_human) {
      // Process flow
      const { data: flowNodes } = await supabase
        .from("chatbot_flow_nodes")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("is_active", true);
      
      if (flowNodes && flowNodes.length > 0) {
        const cleanMessage = messageText.trim();
        
        // Check for back command
        if (cleanMessage === "0" || cleanMessage.toLowerCase() === "voltar") {
          const { data: mainFlow } = await supabase
            .from("chatbot_flows")
            .select("*")
            .eq("seller_id", sellerId)
            .eq("is_active", true)
            .eq("is_main_menu", true)
            .maybeSingle();
          
          if (mainFlow) {
            const { data: rootNodes } = await supabase
              .from("chatbot_flow_nodes")
              .select("*")
              .eq("flow_id", mainFlow.id)
              .eq("seller_id", sellerId)
              .eq("is_active", true)
              .is("parent_node_id", null)
              .order("sort_order");
            
            if (rootNodes && rootNodes.length > 0) {
              const menuText = buildFlowMenuText(rootNodes as ChatbotFlowNode[]);
              
              await supabase
                .from("chatbot_flow_sessions")
                .update({
                  current_flow_id: mainFlow.id,
                  current_node_id: null,
                  last_interaction_at: now.toISOString(),
                })
                .eq("id", flowSession.id);

              const sent = await sendTextMessage(globalConfig, instanceName, phone, menuText, supabase, sellerId);
              
              return new Response(
                JSON.stringify({ status: sent ? "sent" : "failed", type: "flow_main_menu" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }

        const parentId = flowSession.current_node_id;
        const matchedNode = findNodeByOption(flowNodes as ChatbotFlowNode[], cleanMessage, parentId);

        if (matchedNode) {
          const result = await processFlowNode(
            supabase,
            globalConfig,
            instanceName,
            phone,
            matchedNode,
            flowNodes as ChatbotFlowNode[],
            flowSession,
            sellerId,
            chatbotSettings
          );

          await supabase.from("chatbot_interactions").insert({
            seller_id: sellerId,
            contact_id: contact?.id,
            phone,
            incoming_message: messageText,
            response_sent: matchedNode.response_content,
            response_type: "flow_" + matchedNode.response_type,
            was_blocked: false,
          });

          if (contact?.id) {
            await supabase
              .from("chatbot_contacts")
              .update({
                last_interaction_at: now.toISOString(),
                interaction_count: (contact?.interaction_count || 0) + 1,
              })
              .eq("id", contact.id);
          }

          return new Response(
            JSON.stringify({
              status: result.sent ? "sent" : "failed",
              type: "flow_node",
              node: matchedNode.title,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Check if should start new flow
    const flowTriggers = ["menu", "inicio", "início", "opcoes", "opções", "ajuda", "help", "#"];
    const shouldStartFlow = flowTriggers.some(t => messageText.toLowerCase().trim().includes(t));

    if (shouldStartFlow) {
      const { data: mainFlow } = await supabase
        .from("chatbot_flows")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("is_active", true)
        .eq("is_main_menu", true)
        .maybeSingle();

      if (mainFlow) {
        const { data: rootNodes } = await supabase
          .from("chatbot_flow_nodes")
          .select("*")
          .eq("flow_id", mainFlow.id)
          .eq("seller_id", sellerId)
          .eq("is_active", true)
          .is("parent_node_id", null)
          .order("sort_order");

        if (rootNodes && rootNodes.length > 0) {
          if (flowSession) {
            await supabase
              .from("chatbot_flow_sessions")
              .update({
                current_flow_id: mainFlow.id,
                current_node_id: null,
                is_active: true,
                awaiting_human: false,
                last_interaction_at: now.toISOString(),
              })
              .eq("id", flowSession.id);
          } else {
            await supabase
              .from("chatbot_flow_sessions")
              .insert({
                seller_id: sellerId,
                contact_phone: phone,
                current_flow_id: mainFlow.id,
                is_active: true,
              });
          }

          const menuText = buildFlowMenuText(rootNodes as ChatbotFlowNode[], mainFlow.description ? mainFlow.description + "\n\n" : undefined);
          
          if (chatbotSettings.typing_enabled) {
            const typingDuration = getRandomDelay(
              chatbotSettings.typing_duration_min,
              chatbotSettings.typing_duration_max
            );
            await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
          }
          
          const sent = await sendTextMessage(globalConfig, instanceName, phone, menuText, supabase, sellerId);

          await supabase.from("chatbot_interactions").insert({
            seller_id: sellerId,
            contact_id: contact?.id,
            phone,
            incoming_message: messageText,
            response_sent: { text: menuText },
            response_type: "flow_menu",
            was_blocked: false,
          });

          return new Response(
            JSON.stringify({ status: sent ? "sent" : "failed", type: "flow_start" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fallback to regular rules
    const { data: rules } = await supabase
      .from("chatbot_rules")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("is_active", true)
      .order("priority", { ascending: false });
    
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ status: "ignored", reason: "No rules configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const matchingRule = findMatchingRule(rules, messageText, contactStatus);
    
    if (!matchingRule) {
      await supabase.from("chatbot_interactions").insert({
        seller_id: sellerId,
        contact_id: contact?.id,
        phone,
        incoming_message: messageText,
        was_blocked: true,
        block_reason: "No matching rule",
      });
      
      return new Response(JSON.stringify({ status: "ignored", reason: "No matching rule" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Detect if user is navigating the flow (numbers, *, voltar, etc.)
    const isFlowNav = isFlowNavigationInput(messageText);
    
    // Check cooldown - ONLY blocks if NOT navigating flow
    const cooldownCheck = canRespond(contact, matchingRule, now, isFlowNav);
    if (!cooldownCheck.canSend) {
      await supabase.from("chatbot_interactions").insert({
        seller_id: sellerId,
        contact_id: contact?.id,
        phone,
        incoming_message: messageText,
        rule_id: matchingRule.id,
        was_blocked: true,
        block_reason: cooldownCheck.reason,
      });
      
      console.log("[SellerChatbot] Cooldown active (initial message only):", cooldownCheck.reason);
      return new Response(JSON.stringify({ status: "blocked", reason: cooldownCheck.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (isFlowNav) {
      console.log("[SellerChatbot] Flow navigation detected, bypassing cooldown");
    }
    
    // Handle free mode restrictions
    if (matchingRule.cooldown_mode === "free" && 
        (matchingRule.response_type === "text_buttons" || matchingRule.response_type === "text_list")) {
      matchingRule.response_type = "text";
    }
    
    if (!canSendInteractiveContent(contact, matchingRule.response_type, now)) {
      matchingRule.response_type = "text";
    }

    // Send typing if enabled
    if (chatbotSettings.typing_enabled) {
      const typingDuration = getRandomDelay(
        chatbotSettings.typing_duration_min,
        chatbotSettings.typing_duration_max
      );
      await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
    } else {
      const delay = getRandomDelay(
        chatbotSettings.response_delay_min,
        chatbotSettings.response_delay_max
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    // Send response
    let sent = false;
    const content = matchingRule.response_content;
    
    switch (matchingRule.response_type) {
      case "text":
        sent = await sendTextMessage(globalConfig, instanceName, phone, content.text, supabase, sellerId);
        break;
        
      case "text_image":
        if (content.image_url) {
          sent = await sendImageMessage(globalConfig, instanceName, phone, content.text, content.image_url);
        } else {
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text, supabase, sellerId);
        }
        break;
        
      case "text_buttons":
        if (content.buttons && content.buttons.length > 0) {
          sent = await sendButtonsMessage(
            globalConfig,
            instanceName,
            phone,
            content.text,
            content.buttons.map((b) => ({ id: b.trigger, text: b.text }))
          );
        } else {
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text, supabase, sellerId);
        }
        break;
        
      case "text_list":
        if (content.sections && content.sections.length > 0) {
          sent = await sendListMessage(
            globalConfig,
            instanceName,
            phone,
            content.text,
            content.list_button || "Ver opções",
            content.sections.map((s) => ({
              title: s.title,
              items: s.items.map((i) => ({ id: i.trigger, title: i.title, description: i.description })),
            }))
          );
        } else {
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text, supabase, sellerId);
        }
        break;
    }
    
    if (sent) {
      const updateData: Record<string, unknown> = {
        last_interaction_at: now.toISOString(),
        last_response_at: now.toISOString(),
        interaction_count: (contact?.interaction_count || 0) + 1,
        name: pushName || contact?.name,
      };
      
      if (contactStatus === "NEW") {
        updateData.contact_status = "KNOWN";
      }
      
      if (matchingRule.response_type === "text_buttons") {
        updateData.last_buttons_sent_at = now.toISOString();
      }
      if (matchingRule.response_type === "text_list") {
        updateData.last_list_sent_at = now.toISOString();
      }
      
      if (contact?.id) {
        await supabase
          .from("chatbot_contacts")
          .update(updateData)
          .eq("id", contact.id);
      }
      
      await supabase.from("chatbot_interactions").insert({
        seller_id: sellerId,
        contact_id: contact?.id,
        phone,
        incoming_message: messageText,
        rule_id: matchingRule.id,
        response_sent: content,
        response_type: matchingRule.response_type,
      });
    }

    return new Response(
      JSON.stringify({
        status: sent ? "sent" : "failed",
        rule: matchingRule.name,
        type: matchingRule.response_type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
