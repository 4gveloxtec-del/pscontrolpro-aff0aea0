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
  const event =
    (raw?.event as string | undefined) ??
    (raw?.type as string | undefined) ??
    ((raw?.data as any)?.event as string | undefined) ??
    ((raw?.data as any)?.type as string | undefined) ??
    "";

  const instance =
    (raw?.instance as string | undefined) ??
    (raw?.instanceName as string | undefined) ??
    ((raw?.data as any)?.instance as string | undefined) ??
    ((raw?.data as any)?.instanceName as string | undefined) ??
    "";

  // Try to locate the actual message object
  let data: IncomingMessage | undefined = undefined;
  const candidates: unknown[] = [
    raw?.data,
    (raw as any)?.message,
    (raw as any)?.messages?.[0],
    (raw as any)?.data?.data,
    (raw as any)?.data?.message,
    (raw as any)?.data?.messages?.[0],
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

// Send text message via Evolution API
async function sendTextMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  text: string
): Promise<boolean> {
  try {
    const baseUrl = normalizeApiUrl(globalConfig.api_url);
    const formattedPhone = formatPhone(phone);
    const url = `${baseUrl}/message/sendText/${instanceName}`;

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

    console.log(`Text message sent to ${formattedPhone}: ${response.ok}`);
    return response.ok;
  } catch (error) {
    console.error("Error sending text:", error);
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
    if (payload.event && payload.event !== "messages.upsert") {
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
      return new Response(JSON.stringify({ status: "ignored", reason: "API not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const globalConfig: GlobalConfig = globalConfigData;
    
    // Find seller by instance name
    const { data: sellerInstance } = await supabase
      .from("whatsapp_seller_instances")
      .select("seller_id, is_connected, instance_blocked")
      .eq("instance_name", instanceName)
      .maybeSingle();
    
    if (!sellerInstance || sellerInstance.instance_blocked) {
      console.log("Seller instance not found or blocked");
      return new Response(JSON.stringify({ status: "ignored", reason: "Instance not found or blocked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const sellerId = sellerInstance.seller_id;
    
    // Get chatbot settings for this seller
    const { data: settings } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("seller_id", sellerId)
      .maybeSingle();
    
    const chatbotSettings: ChatbotSettings = settings || {
      is_enabled: false,
      response_delay_min: 2,
      response_delay_max: 5,
      ignore_groups: true,
      ignore_own_messages: true,
    };
    
    if (!chatbotSettings.is_enabled) {
      console.log("Chatbot disabled for seller:", sellerId);
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
    
    // Apply delay
    const delay = getRandomDelay(
      chatbotSettings.response_delay_min,
      chatbotSettings.response_delay_max
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    // Send response based on type
    let sent = false;
    const content = matchingRule.response_content;
    
    switch (matchingRule.response_type) {
      case "text":
        sent = await sendTextMessage(globalConfig, instanceName, phone, content.text);
        break;
        
      case "text_image":
        if (content.image_url) {
          sent = await sendImageMessage(globalConfig, instanceName, phone, content.text, content.image_url);
        } else {
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text);
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
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text);
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
          sent = await sendTextMessage(globalConfig, instanceName, phone, content.text);
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
