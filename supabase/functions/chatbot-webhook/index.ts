import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  // Evolution / Baileys payloads can vary a lot depending on version/config.
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

  // Try to locate the actual message object
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

// Helper: Extract phone number from remoteJid
function extractPhone(remoteJid: string): string {
  return remoteJid.split("@")[0].replace(/\D/g, "");
}

// Helper: Check if it's a group message
function isGroupMessage(remoteJid: string): boolean {
  return remoteJid.includes("@g.us");
}

// Helper: Extract text from message
function extractMessageText(message: IncomingMessage["message"]): string | null {
  if (!message) return null;
  
  // Ignore audio, video, sticker
  if (message.audioMessage || message.videoMessage || message.stickerMessage) {
    return null;
  }
  
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  // Button response
  if (message.buttonsResponseMessage?.selectedButtonId) {
    return `__BUTTON__:${message.buttonsResponseMessage.selectedButtonId}`;
  }
  
  // List response
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return `__LIST__:${message.listResponseMessage.singleSelectReply.selectedRowId}`;
  }
  
  return null;
}

// Helper: Random delay
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// Helper: Check cooldown based on mode
function canRespond(
  contact: ChatbotContact | null,
  rule: ChatbotRule,
  now: Date
): { canSend: boolean; reason?: string } {
  // Free mode always responds
  if (rule.cooldown_mode === "free") {
    return { canSend: true };
  }
  
  if (!contact?.last_response_at) {
    return { canSend: true };
  }
  
  const lastResponse = new Date(contact.last_response_at);
  const hoursSinceLastResponse = (now.getTime() - lastResponse.getTime()) / (1000 * 60 * 60);
  
  // Polite mode: 24h
  if (rule.cooldown_mode === "polite" && hoursSinceLastResponse < 24) {
    return { canSend: false, reason: "Cooldown 24h ainda ativo" };
  }
  
  // Moderate mode: configurable
  if (rule.cooldown_mode === "moderate" && hoursSinceLastResponse < rule.cooldown_hours) {
    return { canSend: false, reason: `Cooldown ${rule.cooldown_hours}h ainda ativo` };
  }
  
  return { canSend: true };
}

// Helper: Check if can send buttons/list (24h limit)
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

// Helper: Find matching rule
function findMatchingRule(
  rules: ChatbotRule[],
  messageText: string,
  contactStatus: string
): ChatbotRule | null {
  const lowerMessage = messageText.toLowerCase().trim();
  
  // Handle button/list responses - look for trigger matches
  if (lowerMessage.startsWith("__button__:") || lowerMessage.startsWith("__list__:")) {
    const triggerId = lowerMessage.split(":")[1];
    
    // Find rule where the trigger matches
    for (const rule of rules) {
      if (rule.trigger_text.toLowerCase() === triggerId.toLowerCase()) {
        if (rule.contact_filter === "ALL" || rule.contact_filter === contactStatus) {
          return rule;
        }
      }
    }
    return null;
  }
  
  // Sort by priority (higher first), then by specificity (non-global first)
  const sortedRules = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.is_global_trigger !== b.is_global_trigger) return a.is_global_trigger ? 1 : -1;
    return 0;
  });
  
  // First, try specific triggers
  for (const rule of sortedRules) {
    if (rule.is_global_trigger) continue;
    
    // Check contact filter
    if (rule.contact_filter !== "ALL" && rule.contact_filter !== contactStatus) {
      continue;
    }
    
    const triggerLower = rule.trigger_text.toLowerCase().trim();
    
    // Exact match or contains
    if (lowerMessage === triggerLower || lowerMessage.includes(triggerLower)) {
      return rule;
    }
  }
  
  // No specific match found, try global triggers
  for (const rule of sortedRules) {
    if (!rule.is_global_trigger) continue;
    
    // Check contact filter
    if (rule.contact_filter !== "ALL" && rule.contact_filter !== contactStatus) {
      continue;
    }
    
    // Global triggers with asterisks
    if (rule.trigger_text === "*" || rule.trigger_text === "**" || rule.trigger_text === "***") {
      return rule;
    }
  }
  
  return null;
}

// Helper: Get or create flow session for contact
async function getFlowSession(
  supabase: any,
  sellerId: string,
  phone: string
): Promise<ChatbotFlowSession | null> {
  const { data } = await supabase
    .from("chatbot_flow_sessions")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("contact_phone", phone)
    .eq("is_active", true)
    .maybeSingle();

  return data;
}

// Helper: Build menu text from flow nodes
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

// Helper: Find node by option number within current context
function findNodeByOption(
  nodes: ChatbotFlowNode[],
  optionNumber: string,
  parentNodeId: string | null
): ChatbotFlowNode | null {
  const cleanOption = optionNumber.trim();
  
  // Handle special commands
  if (cleanOption === "0" || cleanOption.toLowerCase() === "voltar") {
    return null; // Will trigger go back logic
  }
  
  // Find matching node at current level
  return nodes.find(
    (n) => 
      n.is_active && 
      n.parent_node_id === parentNodeId && 
      n.option_number === cleanOption
  ) || null;
}

// Helper: Process flow response
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
  
  // Send typing if enabled
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
      if (node.response_type === "text_image" && node.response_content.image_url) {
        sent = await sendImageMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content.text,
          node.response_content.image_url
        );
      } else {
        sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content.text,
          supabase,
          sellerId
        );
      }
      return { sent, endSession: false, awaitHuman: false };
    }

    case "submenu": {
      // Get child nodes and display submenu
      const childNodes = allNodes.filter(
        (n) => n.parent_node_id === node.id && n.is_active
      );
      
      if (childNodes.length === 0) {
        // No children, just send the text
        const sent = await sendTextMessage(
          globalConfig,
          instanceName,
          phone,
          node.response_content.text,
          supabase,
          sellerId
        );
        return { sent, endSession: false, awaitHuman: false };
      }

      // Build submenu text
      const menuText = buildFlowMenuText(childNodes, node.response_content.text + "\n\n");
      const menuWithBack = menuText + "\n*0* - Voltar ao menu anterior";
      
      const sent = await sendTextMessage(
        globalConfig,
        instanceName,
        phone,
        menuWithBack,
        supabase,
        sellerId
      );

      // Update session to current node
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
      // Fetch template and send its content
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
            template.response_content?.text || node.response_content.text,
            supabase,
            sellerId
          );
          return { sent, endSession: false, awaitHuman: false };
        }
      }
      
      // Fallback to node text
      const sent = await sendTextMessage(
        globalConfig,
        instanceName,
        phone,
        node.response_content.text,
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
        node.response_content.text || "Aguarde, você será atendido por um de nossos atendentes.",
        supabase,
        sellerId
      );

      // Mark session as awaiting human
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
        node.response_content.text || "Obrigado pelo contato! Até a próxima.",
        supabase,
        sellerId
      );

      // End session
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
}
// Helper: Clean and normalize API URL (prevents /manager mistakes)
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  cleanUrl = cleanUrl.replace(/\/manager\/?$/i, "");
  cleanUrl = cleanUrl.replace(/\/+$/, "");
  return cleanUrl;
}

function formatPhone(phone: string): string {
  let formatted = (phone || "").replace(/\D/g, "");

  if (formatted.startsWith("55")) return formatted;

  // Brazilian local numbers (DDD + number)
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
    console.log("auditWebhook failed", e);
  }
}

// Send "typing" status via Evolution API
async function sendTypingStatus(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  durationMs: number
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    
    // Try different endpoints for typing status
    const endpoints = [
      `${baseUrl}/chat/sendPresence/${instanceName}`,
      `${baseUrl}/message/sendPresence/${instanceName}`,
      `${baseUrl}/chat/presence/${instanceName}`,
    ];

    let sent = false;
    
    for (const url of endpoints) {
      try {
        console.log(`[sendTypingStatus] Trying: ${url}`);
        
        const response = await fetch(url, {
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
        });

        if (response.ok) {
          console.log(`[sendTypingStatus] Success with: ${url}`);
          sent = true;
          break;
        }
      } catch (e) {
        console.log(`[sendTypingStatus] Failed with: ${url}`);
      }
    }

    if (sent) {
      // Wait for typing duration
      await new Promise((resolve) => setTimeout(resolve, durationMs));
    }

    return sent;
  } catch (error) {
    console.error("[sendTypingStatus] Error:", error);
    return false;
  }
}

// Validate API connection before sending
async function validateApiConnection(
  globalConfig: GlobalConfig,
  instanceName: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const url = `${baseUrl}/instance/connectionState/${instanceName}`;

    console.log(`[validateApiConnection] Checking: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: globalConfig.api_token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[validateApiConnection] API error: ${response.status} - ${errorText}`);
      return { connected: false, error: `API retornou ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const state = data?.instance?.state || data?.state || data?.connectionState;
    
    console.log(`[validateApiConnection] State: ${state}`);
    
    if (state === "open" || state === "connected") {
      return { connected: true };
    }

    return { connected: false, error: `Instância não conectada: ${state}` };
  } catch (error: any) {
    console.error("[validateApiConnection] Error:", error);
    return { connected: false, error: error.message };
  }
}

// Log send attempt to database
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
    console.log("[logSendAttempt] Failed to log:", e);
  }
}

// Send text message via Evolution API
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

    console.log(`[sendTextMessage] URL: ${url}`);
    console.log(`[sendTextMessage] Phone: ${formattedPhone}`);
    console.log(`[sendTextMessage] Instance: ${instanceName}`);

    const response = await fetch(url, {
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
    console.log(`[sendTextMessage] Response: ${response.status} - ${responseText}`);
    
    // Log the attempt
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

// Send image with caption via Evolution API
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

    const response = await fetch(url, {
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

    console.log(`Image message sent to ${formattedPhone}: ${response.ok}`);
    return response.ok;
  } catch (error) {
    console.error("Error sending image:", error);
    return false;
  }
}

// Send buttons message via Evolution API v2
async function sendButtonsMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string,
  buttons: Array<{ id: string; text: string }>
): Promise<boolean> {
  try {
    // Evolution API v2 uses sendTemplate or sendButtons with different format
    // Try the v2 format first
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    
    // Try native buttons first (some versions support it)
    const buttonsUrl = `${baseUrl}/message/sendButtons/${instanceName}`;
    
    const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
      type: "reply",
      reply: {
        id: btn.id || `btn_${index}`,
        title: btn.text.slice(0, 20) // WhatsApp button limit
      }
    }));
    
    console.log(`Sending buttons to ${formattedPhone} via ${buttonsUrl}`);
    console.log("Buttons payload:", JSON.stringify(formattedButtons));
    
    const response = await fetch(buttonsUrl, {
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
    
    const responseText = await response.text();
    console.log(`Buttons API response: ${response.status} - ${responseText}`);
    
    if (response.ok) {
      return true;
    }
    
    // If native buttons fail, try interactive buttons format
    console.log("Native buttons failed, trying interactive format...");
    
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
    
    console.log("Interactive payload:", JSON.stringify(interactivePayload));
    
    const interactiveResponse = await fetch(interactiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify(interactivePayload),
    });
    
    const interactiveText = await interactiveResponse.text();
    console.log(`Interactive API response: ${interactiveResponse.status} - ${interactiveText}`);
    
    if (interactiveResponse.ok) {
      return true;
    }
    
    // Last resort: send as regular text with emoji buttons
    console.log("Interactive also failed, sending as text with options...");
    
    const textWithButtons = `${text}\n\n${buttons.map((btn, i) => `${i + 1}️⃣ ${btn.text}`).join('\n')}\n\n_Responda com o número da opção desejada._`;
    
    return await sendTextMessage(globalConfig, instanceName, phone, textWithButtons);
  } catch (error) {
    console.error("Error sending buttons:", error);
    return false;
  }
}

// Send list message via Evolution API v2
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
    
    // Try native list endpoint first
    const listUrl = `${baseUrl}/message/sendList/${instanceName}`;
    
    const formattedSections = sections.map((section) => ({
      title: section.title.slice(0, 24), // WhatsApp section title limit
      rows: section.items.slice(0, 10).map((item) => ({
        rowId: item.id,
        title: item.title.slice(0, 24), // WhatsApp row title limit
        description: (item.description || "").slice(0, 72), // WhatsApp description limit
      })),
    }));
    
    console.log(`Sending list to ${formattedPhone} via ${listUrl}`);
    console.log("List sections:", JSON.stringify(formattedSections));
    
    const response = await fetch(listUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        title: "Menu",
        description: text,
        buttonText: buttonText.slice(0, 20), // WhatsApp button text limit
        footerText: "",
        sections: formattedSections,
      }),
    });
    
    const responseText = await response.text();
    console.log(`List API response: ${response.status} - ${responseText}`);
    
    if (response.ok) {
      return true;
    }
    
    // Try interactive list format
    console.log("Native list failed, trying interactive format...");
    
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
    
    console.log("Interactive list payload:", JSON.stringify(interactivePayload));
    
    const interactiveResponse = await fetch(interactiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: globalConfig.api_token,
      },
      body: JSON.stringify(interactivePayload),
    });
    
    const interactiveText = await interactiveResponse.text();
    console.log(`Interactive list API response: ${interactiveResponse.status} - ${interactiveText}`);
    
    if (interactiveResponse.ok) {
      return true;
    }
    
    // Last resort: send as regular text with numbered list
    console.log("Interactive list also failed, sending as text with options...");
    
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
    console.error("Error sending list:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Diagnostic endpoint: GET request returns debug info
    if (req.method === "GET") {
      // Parse URL - handle edge case where ? is encoded as %3F
      let rawUrl = req.url;
      // If %3F exists (encoded ?), decode it for proper parsing
      if (rawUrl.includes("%3F")) {
        rawUrl = rawUrl.replace(/%3F/g, "?").replace(/%26/g, "&").replace(/%3D/g, "=");
      }
      
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        parsedUrl = new URL(rawUrl, "https://placeholder.co");
      }

      const testApi = parsedUrl.searchParams.get("test_api") === "true";
      const testSend = parsedUrl.searchParams.get("test_send") === "true";
      const testPhone = parsedUrl.searchParams.get("phone") || "";
      const testText = parsedUrl.searchParams.get("text") || "Teste do chatbot";
      const testInstance = parsedUrl.searchParams.get("instance") || "";

      console.log(`[Diag] Raw URL: ${req.url}`);
      console.log(`[Diag] Parsed URL: ${rawUrl}`);
      console.log(`[Diag] test_api=${testApi}, test_send=${testSend}, phone=${testPhone}, instance=${testInstance}`);

      const { data: instances } = await supabase
        .from("whatsapp_seller_instances")
        .select("instance_name, seller_id, is_connected, instance_blocked, plan_status");

      // Always read the most recently updated config row (some projects accidentally create multiple rows)
      const {
        data: globalConfig,
        error: globalConfigError,
      } = await supabase
        .from("whatsapp_global_config")
        .select("api_url, api_token, is_active, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Check for specific instance diagnosis
      const diagnoseInstance = parsedUrl.searchParams.get("diagnose") || "";
      
      const { data: chatbotSettings } = await supabase
        .from("chatbot_settings")
        .select("seller_id, is_enabled, ignore_groups, ignore_own_messages, typing_enabled");

      const { data: chatbotRules } = await supabase
        .from("chatbot_rules")
        .select("seller_id, name, is_active, trigger_text, response_type, is_global_trigger, priority");
      
      const { data: chatbotFlows } = await supabase
        .from("chatbot_flows")
        .select("seller_id, name, is_active, is_main_menu");
      
      // If diagnose parameter is provided, show detailed info for that instance
      let diagnosisResult: any = null;
      if (diagnoseInstance) {
        const matchedInstance = instances?.find(
          (i: any) => i.instance_name.toLowerCase() === diagnoseInstance.toLowerCase()
        );
        
        if (!matchedInstance) {
          diagnosisResult = {
            status: "ERROR",
            message: `Instância "${diagnoseInstance}" NÃO encontrada no banco de dados`,
            available_instances: instances?.map((i: any) => i.instance_name) || [],
            action_required: "Configure o nome da instância em WhatsApp Automação → Config",
          };
        } else {
          const sellerId = matchedInstance.seller_id;
          const sellerSettings = chatbotSettings?.find((s: any) => s.seller_id === sellerId);
          const sellerRules = chatbotRules?.filter((r: any) => r.seller_id === sellerId && r.is_active) || [];
          const sellerFlows = chatbotFlows?.filter((f: any) => f.seller_id === sellerId && f.is_active) || [];
          
          const problems: string[] = [];
          
          if (matchedInstance.instance_blocked) {
            problems.push("❌ Instância está BLOQUEADA");
          }
          if (!matchedInstance.is_connected) {
            problems.push("⚠️ Instância não está conectada");
          }
          if (!sellerSettings) {
            problems.push("❌ Configurações do chatbot não encontradas - acesse Chatbot → Configurações");
          } else if (!sellerSettings.is_enabled) {
            problems.push("❌ Chatbot está DESATIVADO - ative em Chatbot → Configurações");
          }
          if (sellerRules.length === 0 && sellerFlows.length === 0) {
            problems.push("⚠️ Nenhuma regra ou fluxo ativo - crie regras em Chatbot → Regras");
          }
          
          diagnosisResult = {
            status: problems.length === 0 ? "OK" : "PROBLEMS_FOUND",
            instance: {
              name: matchedInstance.instance_name,
              is_connected: matchedInstance.is_connected,
              is_blocked: matchedInstance.instance_blocked,
              plan_status: matchedInstance.plan_status,
            },
            chatbot: {
              is_enabled: sellerSettings?.is_enabled ?? false,
              settings: sellerSettings || null,
            },
            rules: {
              total_active: sellerRules.length,
              list: sellerRules.map((r: any) => ({
                name: r.name,
                trigger: r.trigger_text,
                type: r.response_type,
                is_global: r.is_global_trigger,
                priority: r.priority,
              })),
            },
            flows: {
              total_active: sellerFlows.length,
              has_main_menu: sellerFlows.some((f: any) => f.is_main_menu),
              list: sellerFlows.map((f: any) => ({
                name: f.name,
                is_main_menu: f.is_main_menu,
              })),
            },
            problems,
            action_required: problems.length > 0 
              ? problems.join(" | ") 
              : "Tudo OK! O chatbot deve responder às mensagens.",
          };
        }
      }

      let apiTestResult: any = null;
      let sendTestResult: any = null;

      const configOk = Boolean(globalConfig?.api_url && globalConfig?.api_token);

      // Test API connection if requested
      if (testApi && configOk) {
        try {
          const baseUrl = normalizeApiUrl(globalConfig!.api_url);
          const testUrl = `${baseUrl}/instance/fetchInstances`;

          console.log(`[API Test] Testing URL: ${testUrl}`);
          console.log(`[API Test] Token length: ${globalConfig!.api_token.length}`);

          const testResponse = await fetch(testUrl, {
            method: "GET",
            headers: {
              apikey: globalConfig!.api_token.trim(),
            },
          });

          const testResponseText = await testResponse.text();
          console.log(`[API Test] Response status: ${testResponse.status}`);
          console.log(`[API Test] Response body: ${testResponseText.substring(0, 500)}`);

          apiTestResult = {
            url_tested: testUrl,
            status: testResponse.status,
            status_text: testResponse.statusText,
            is_ok: testResponse.ok,
            response_preview: testResponseText.substring(0, 300),
            token_length: globalConfig!.api_token.length,
          };
        } catch (error: any) {
          apiTestResult = {
            error: error.message,
            url_configured: globalConfig?.api_url,
          };
        }
      }

      // Test sending a text message (does NOT expose token; requires explicit phone)
      if (testSend && configOk) {
        const instanceToUse =
          testInstance ||
          instances?.find((i: any) => !i.instance_blocked)?.instance_name ||
          "";

        if (!instanceToUse) {
          sendTestResult = { error: "Nenhuma instância disponível para teste" };
        } else if (!testPhone) {
          sendTestResult = { error: "Informe o parâmetro ?phone=5511... para testar envio" };
        } else {
          try {
            const baseUrl = normalizeApiUrl(globalConfig!.api_url);
            const urlSend = `${baseUrl}/message/sendText/${instanceToUse}`;
            const formattedPhone = formatPhone(testPhone);

            console.log(`[Send Test] Testing sendText URL: ${urlSend}`);
            console.log(`[Send Test] Phone: ${formattedPhone}`);
            console.log(`[Send Test] Instance: ${instanceToUse}`);

            const r = await fetch(urlSend, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: globalConfig!.api_token.trim(),
              },
              body: JSON.stringify({ number: formattedPhone, text: testText }),
            });

            const bodyText = await r.text();
            sendTestResult = {
              url_tested: urlSend,
              status: r.status,
              status_text: r.statusText,
              is_ok: r.ok,
              response_preview: bodyText.substring(0, 500),
              instance_used: instanceToUse,
              phone_used: formattedPhone,
            };
          } catch (e: any) {
            sendTestResult = { error: e.message };
          }
        }
      }

      return new Response(
        JSON.stringify(
          {
            status: "diagnostic",
            debug_raw_url: req.url,
            query: {
              test_api: testApi,
              test_send: testSend,
              diagnose: diagnoseInstance || null,
              instance: testInstance || null,
              phone: testPhone ? "(provided)" : null,
              text: testText !== "Teste do chatbot" ? "(custom)" : "(default)",
            },
            // If diagnosing a specific instance, show only that result prominently
            diagnosis: diagnosisResult,
            instances: instances || [],
            globalConfig: globalConfig
              ? {
                  api_url: globalConfig.api_url,
                  is_active: globalConfig.is_active,
                  token_configured: Boolean(globalConfig.api_token),
                  token_length: globalConfig.api_token?.length || 0,
                  selected_row_is_latest: true,
                }
              : null,
            globalConfigError: globalConfigError?.message || null,
            chatbotSettings: chatbotSettings || [],
            chatbotRules: chatbotRules || [],
            chatbotFlows: chatbotFlows || [],
            apiTestResult,
            sendTestResult,
          },
          null,
          2
        ),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse webhook payload (normalize across versions)
    let rawPayload: Record<string, unknown> | null = null;
    try {
      rawPayload = (await req.json()) as Record<string, unknown>;
    } catch {
      rawPayload = null;
    }

    if (!rawPayload) {
      return new Response(JSON.stringify({ status: "ignored", reason: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: WebhookPayload = normalizeWebhookPayload(rawPayload);

    console.log(
      "Webhook received:",
      JSON.stringify(
        {
          event: payload.event,
          instance: payload.instance,
          hasData: Boolean(payload.data),
        },
        null,
        2
      )
    );

    // Only process incoming messages (but some providers omit `event`)
    const eventLower = (payload.event || "").toLowerCase().trim();
    if (eventLower && eventLower !== "messages.upsert") {
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "Not a message event",
        event: payload.event,
        instanceName: payload.instance,
      });
      return new Response(JSON.stringify({ status: "ignored", reason: "Not a message event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = payload.data;
    if (!message?.key?.remoteJid) {
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "No message data",
        event: payload.event,
        instanceName: payload.instance,
      });
      return new Response(JSON.stringify({ status: "ignored", reason: "No message data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = (payload.instance || "").trim();
    if (!instanceName) {
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "No instance name",
        event: payload.event,
      });
      return new Response(JSON.stringify({ status: "ignored", reason: "No instance name" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remoteJid = message.key.remoteJid;
    const fromMe = message.key.fromMe;
    const pushName = message.pushName || "";
    
    // Get global config
    const { data: globalConfigData } = await supabase
      .from("whatsapp_global_config")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    
    if (!globalConfigData) {
      console.log("Global config not active");
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "API not active",
        event: payload.event,
        instanceName,
        remoteJid,
      });
      return new Response(JSON.stringify({ status: "ignored", reason: "API not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const globalConfig: GlobalConfig = globalConfigData;
    
    // Find seller by instance name
    const { data: sellerInstance } = await supabase
      .from("whatsapp_seller_instances")
      .select("seller_id, is_connected, instance_blocked")
      .ilike("instance_name", instanceName)
      .maybeSingle();
    
    if (!sellerInstance || sellerInstance.instance_blocked) {
      console.log("Seller instance not found or blocked");
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "Instance not found or blocked",
        event: payload.event,
        instanceName,
        remoteJid,
      });
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Instance not found or blocked" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    const sellerId = sellerInstance.seller_id;
    
    // Get chatbot settings for this seller
    const { data: settings } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();
    
    const chatbotSettings: ChatbotSettings = {
      is_enabled: settings?.is_enabled ?? false,
      response_delay_min: settings?.response_delay_min ?? 2,
      response_delay_max: settings?.response_delay_max ?? 5,
      ignore_groups: settings?.ignore_groups ?? true,
      ignore_own_messages: settings?.ignore_own_messages ?? true,
      typing_enabled: settings?.typing_enabled ?? true,
      typing_duration_min: settings?.typing_duration_min ?? 2,
      typing_duration_max: settings?.typing_duration_max ?? 5,
    };
    
    if (!chatbotSettings.is_enabled) {
      console.log("Chatbot disabled for seller:", sellerId);
      await auditWebhook(supabase, {
        status: "ignored",
        reason: "Chatbot disabled",
        event: payload.event,
        instanceName,
        remoteJid,
        sellerId,
      });
      return new Response(JSON.stringify({ status: "ignored", reason: "Chatbot disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check if group message
    if (chatbotSettings.ignore_groups && isGroupMessage(remoteJid)) {
      console.log("Ignoring group message");
      return new Response(JSON.stringify({ status: "ignored", reason: "Group message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check if own message
    if (chatbotSettings.ignore_own_messages && fromMe) {
      console.log("Ignoring own message");
      return new Response(JSON.stringify({ status: "ignored", reason: "Own message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Extract message text
    const messageText = extractMessageText(message.message);
    if (!messageText) {
      console.log("No text content (audio/video/sticker/empty)");
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
      // Check if this phone belongs to an existing client
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("seller_id", sellerId)
        .ilike("phone", `%${phone.slice(-9)}%`)
        .maybeSingle();
      
      const { data: newContact, error: insertError } = await supabase
        .from("chatbot_contacts")
        .insert({
          seller_id: sellerId,
          phone,
          contact_status: existingClient ? "CLIENT" : "NEW",
          client_id: existingClient?.id || null,
          name: pushName,
        })
        .select()
        .single();
      
      if (insertError) {
        console.error("Error creating contact:", insertError);
      }
      
      contact = newContact;
    }
    
    const contactStatus = contact?.contact_status || "NEW";
    
    // ===== CHECK FOR ACTIVE FLOW SESSION =====
    const flowSession = await getFlowSession(supabase, sellerId, phone);
    
    if (flowSession && !flowSession.awaiting_human) {
      console.log("Active flow session found for contact");
      
      // Get main menu flow if no current flow
      let currentFlowId = flowSession.current_flow_id;
      if (!currentFlowId) {
        const { data: mainFlow } = await supabase
          .from("chatbot_flows")
          .select("id")
          .eq("seller_id", sellerId)
          .eq("is_active", true)
          .eq("is_main_menu", true)
          .maybeSingle();
        
        if (mainFlow) {
          currentFlowId = mainFlow.id;
        }
      }

      if (currentFlowId) {
        // Get all nodes for this flow
        const { data: flowNodes } = await supabase
          .from("chatbot_flow_nodes")
          .select("*")
          .eq("flow_id", currentFlowId)
          .eq("seller_id", sellerId)
          .eq("is_active", true)
          .order("sort_order");

        if (flowNodes && flowNodes.length > 0) {
          const cleanMessage = messageText.trim();
          
          // Check for "voltar" or "0" to go back
          if (cleanMessage === "0" || cleanMessage.toLowerCase() === "voltar") {
            // Go back to parent or main menu
            if (flowSession.current_node_id) {
              const currentNode = flowNodes.find(n => n.id === flowSession.current_node_id);
              
              if (currentNode?.parent_node_id) {
                // Go to parent node's level
                const parentNode = flowNodes.find(n => n.id === currentNode.parent_node_id);
                const siblings = flowNodes.filter(n => n.parent_node_id === parentNode?.parent_node_id);
                const menuText = buildFlowMenuText(siblings.length > 0 ? siblings : flowNodes.filter(n => !n.parent_node_id));
                
                await supabase
                  .from("chatbot_flow_sessions")
                  .update({
                    current_node_id: parentNode?.parent_node_id || null,
                    last_interaction_at: new Date().toISOString(),
                  })
                  .eq("id", flowSession.id);

                const sent = await sendTextMessage(globalConfig, instanceName, phone, menuText, supabase, sellerId);
                
                return new Response(
                  JSON.stringify({ status: sent ? "sent" : "failed", type: "flow_back" }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            }
            
            // Go to main menu
            const rootNodes = flowNodes.filter(n => !n.parent_node_id);
            const menuText = buildFlowMenuText(rootNodes);
            
            await supabase
              .from("chatbot_flow_sessions")
              .update({
                current_node_id: null,
                last_interaction_at: new Date().toISOString(),
              })
              .eq("id", flowSession.id);

            const sent = await sendTextMessage(globalConfig, instanceName, phone, menuText, supabase, sellerId);
            
            return new Response(
              JSON.stringify({ status: sent ? "sent" : "failed", type: "flow_main_menu" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Find matching node for the option
          const parentId = flowSession.current_node_id;
          const matchedNode = findNodeByOption(flowNodes, cleanMessage, parentId);

          if (matchedNode) {
            const result = await processFlowNode(
              supabase,
              globalConfig,
              instanceName,
              phone,
              matchedNode,
              flowNodes,
              flowSession,
              sellerId,
              chatbotSettings
            );

            // Log interaction
            await supabase.from("chatbot_interactions").insert({
              seller_id: sellerId,
              contact_id: contact?.id,
              phone,
              incoming_message: messageText,
              response_sent: matchedNode.response_content,
              response_type: "flow_" + matchedNode.response_type,
              was_blocked: false,
            });

            // Update contact interaction
            await supabase
              .from("chatbot_contacts")
              .update({
                last_interaction_at: new Date().toISOString(),
                interaction_count: (contact?.interaction_count || 0) + 1,
              })
              .eq("id", contact?.id);

            return new Response(
              JSON.stringify({
                status: result.sent ? "sent" : "failed",
                type: "flow_node",
                node: matchedNode.title,
                endSession: result.endSession,
                awaitHuman: result.awaitHuman,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    // ===== CHECK IF MESSAGE SHOULD START A NEW FLOW =====
    // Check for keywords like "menu", "inicio", "opcoes" to start flow
    const flowTriggers = ["menu", "inicio", "início", "opcoes", "opções", "ajuda", "help", "#"];
    const shouldStartFlow = flowTriggers.some(t => messageText.toLowerCase().trim().includes(t));

    if (shouldStartFlow) {
      // Get main menu flow
      const { data: mainFlow } = await supabase
        .from("chatbot_flows")
        .select("*")
        .eq("seller_id", sellerId)
        .eq("is_active", true)
        .eq("is_main_menu", true)
        .maybeSingle();

      if (mainFlow) {
        // Get root nodes
        const { data: rootNodes } = await supabase
          .from("chatbot_flow_nodes")
          .select("*")
          .eq("flow_id", mainFlow.id)
          .eq("seller_id", sellerId)
          .eq("is_active", true)
          .is("parent_node_id", null)
          .order("sort_order");

        if (rootNodes && rootNodes.length > 0) {
          // Create or update session
          if (flowSession) {
            await supabase
              .from("chatbot_flow_sessions")
              .update({
                current_flow_id: mainFlow.id,
                current_node_id: null,
                is_active: true,
                awaiting_human: false,
                last_interaction_at: new Date().toISOString(),
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

          // Send menu
          const menuText = buildFlowMenuText(rootNodes as ChatbotFlowNode[], mainFlow.description ? mainFlow.description + "\n\n" : undefined);
          
          if (chatbotSettings.typing_enabled) {
            const typingDuration = getRandomDelay(
              chatbotSettings.typing_duration_min,
              chatbotSettings.typing_duration_max
            );
            await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
          }
          
          const sent = await sendTextMessage(globalConfig, instanceName, phone, menuText, supabase, sellerId);

          // Log interaction
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

    // ===== FALLBACK TO REGULAR RULES =====
    // Get active rules for this seller
    const { data: rules } = await supabase
      .from("chatbot_rules")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("is_active", true)
      .order("priority", { ascending: false });
    
    if (!rules || rules.length === 0) {
      console.log("No active rules for seller:", sellerId);
      return new Response(JSON.stringify({ status: "ignored", reason: "No rules configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Find matching rule
    const matchingRule = findMatchingRule(rules, messageText, contactStatus);
    
    if (!matchingRule) {
      console.log("No matching rule found for message:", messageText);
      
      // Log interaction even if no response
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
    
    console.log("Matching rule found:", matchingRule.name);
    
    // Check cooldown
    const cooldownCheck = canRespond(contact, matchingRule, now);
    if (!cooldownCheck.canSend) {
      console.log("Cooldown active:", cooldownCheck.reason);
      
      await supabase.from("chatbot_interactions").insert({
        seller_id: sellerId,
        contact_id: contact?.id,
        phone,
        incoming_message: messageText,
        rule_id: matchingRule.id,
        was_blocked: true,
        block_reason: cooldownCheck.reason,
      });
      
      return new Response(JSON.stringify({ status: "blocked", reason: cooldownCheck.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Check interactive content restrictions for free mode
    if (matchingRule.cooldown_mode === "free" && 
        (matchingRule.response_type === "text_buttons" || matchingRule.response_type === "text_list")) {
      console.log("Free mode cannot send buttons/list");
      
      // Fallback to text only
      matchingRule.response_type = "text";
    }
    
    // Check 24h limit for buttons/list
    if (!canSendInteractiveContent(contact, matchingRule.response_type, now)) {
      console.log("Interactive content 24h limit reached");
      
      // Fallback to text only
      matchingRule.response_type = "text";
    }

    // Validate API connection before sending
    const connectionCheck = await validateApiConnection(globalConfig, instanceName);
    if (!connectionCheck.connected) {
      console.log("API connection validation failed:", connectionCheck.error);
      
      // Log the failure
      await logSendAttempt(
        supabase,
        sellerId,
        phone,
        instanceName,
        matchingRule.response_type,
        false,
        undefined,
        undefined,
        connectionCheck.error || "Instância desconectada"
      );

      // Update instance status
      await supabase
        .from("whatsapp_seller_instances")
        .update({ is_connected: false })
        .eq("seller_id", sellerId);

      await auditWebhook(supabase, {
        status: "failed",
        reason: connectionCheck.error || "API disconnected",
        event: payload.event,
        instanceName,
        remoteJid,
        sellerId,
      });

      return new Response(
        JSON.stringify({ 
          status: "failed", 
          reason: "API disconnected", 
          error: connectionCheck.error 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send "typing" status if enabled
    if (chatbotSettings.typing_enabled) {
      const typingDuration = getRandomDelay(
        chatbotSettings.typing_duration_min,
        chatbotSettings.typing_duration_max
      );
      console.log(`[Chatbot] Sending typing status for ${typingDuration}ms`);
      await sendTypingStatus(globalConfig, instanceName, phone, typingDuration);
    } else {
      // Apply regular delay if typing is disabled
      const delay = getRandomDelay(
        chatbotSettings.response_delay_min,
        chatbotSettings.response_delay_max
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    // Send response based on type
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
      // Update contact
      const updateData: Record<string, unknown> = {
        last_interaction_at: now.toISOString(),
        last_response_at: now.toISOString(),
        interaction_count: (contact?.interaction_count || 0) + 1,
        name: pushName || contact?.name,
      };
      
      // Update status from NEW to KNOWN after first response
      if (contactStatus === "NEW") {
        updateData.contact_status = "KNOWN";
      }
      
      // Track interactive content sent time
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
      
      // Log interaction
      await supabase.from("chatbot_interactions").insert({
        seller_id: sellerId,
        contact_id: contact?.id,
        phone,
        incoming_message: messageText,
        rule_id: matchingRule.id,
        response_sent: content,
        response_type: matchingRule.response_type,
      });
      
      console.log("Response sent successfully");
    }
    
    await auditWebhook(supabase, {
      status: sent ? "sent" : "failed",
      reason: sent ? null : "Send API returned not ok",
      event: payload.event,
      instanceName,
      remoteJid,
      sellerId,
      rule: matchingRule?.name,
      type: matchingRule?.response_type,
    });

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
