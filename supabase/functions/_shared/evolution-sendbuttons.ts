/**
 * BOT ENGINE - Botões Interativos WhatsApp
 * 
 * FORMATO EVOLUTION API v2.3.7 (atendai/evolution-api:latest):
 * POST /message/sendButtons/{instance}
 * {
 *   "number": "5511999999999@c.us",
 *   "body": "Texto do menu",
 *   "buttons": [{"id": "1", "text": "Opção 1"}, ...]
 * }
 * 
 * IMPORTANTE: Usar 'text' (não 'title'), máx 3 botões, 20 chars por texto
 */

export interface ButtonOption {
  buttonId: string;
  buttonText: string;
}

export interface ButtonsMessage {
  title: string;
  description?: string;
  footerText?: string;
  buttons: ButtonOption[];
}

type PayloadVariant = {
  name: string;
  payload: unknown;
};

function stripMarkdown(input: string): string {
  return String(input || '')
    .replace(/[*_~`]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

function ensureNonEmpty(input: string | undefined | null, fallback: string): string {
  const v = String(input ?? '').trim();
  return v.length ? v : fallback;
}

/**
 * Gera payload para Evolution API v2.3.7 sendButtons
 * Formato: { number, body, buttons: [{id, text}] }
 */
export function buildSendButtonsPayloadVariants(
  message: ButtonsMessage,
  phoneNumber: string
): PayloadVariant[] {
  const safeTitle = ensureNonEmpty(message.title, 'Menu').substring(0, 60);
  const safeDescription = ensureNonEmpty(message.description, 'Selecione uma opção');

  // Limitar a 3 botões (requisito do WhatsApp)
  const limitedButtons = message.buttons.slice(0, 3);

  // Body text limpo (sem markdown excessivo)
  const bodyText = `${safeTitle}\n\n${safeDescription}`.substring(0, 1024);

  // Evolution API v2.3.7 EXIGE type: "reply" em cada botão
  // Testar variações: body, title, e text como campo raiz
  return [
    {
      // Formato com title + body (alguns setups da Evolution API usam title)
      name: 'evolution.v237.title.body',
      payload: {
        number: `${phoneNumber}@c.us`,
        title: safeTitle,
        body: safeDescription,
        buttons: limitedButtons.map((btn, idx) => ({
          type: 'reply',
          id: btn.buttonId || String(idx + 1),
          text: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20),
        })),
      },
    },
    {
      // Formato só com body (concatenado)
      name: 'evolution.v237.body.only',
      payload: {
        number: `${phoneNumber}@c.us`,
        body: bodyText,
        buttons: limitedButtons.map((btn, idx) => ({
          type: 'reply',
          id: btn.buttonId || String(idx + 1),
          text: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20),
        })),
      },
    },
    {
      // Formato com text (alguns usam 'text' em vez de 'body')
      name: 'evolution.v237.text.field',
      payload: {
        number: `${phoneNumber}@c.us`,
        text: bodyText,
        buttons: limitedButtons.map((btn, idx) => ({
          type: 'reply',
          id: btn.buttonId || String(idx + 1),
          text: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20),
        })),
      },
    },
  ];
}

/**
 * Converte uma InteractiveListMessage para ButtonsMessage
 * Seleciona apenas os 3 primeiros itens de todas as seções
 */
export function listToButtons(list: {
  title: string;
  description?: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      title: string;
      description?: string;
      rowId: string;
    }>;
  }>;
}): ButtonsMessage {
  // Coletar todos os rows de todas as seções
  const allRows: Array<{ title: string; rowId: string }> = [];
  
  for (const section of list.sections) {
    for (const row of section.rows) {
      allRows.push({
        title: row.title,
        rowId: row.rowId,
      });
    }
  }

  // Pegar apenas os 3 primeiros
  const topThree = allRows.slice(0, 3);

  return {
    title: list.title,
    description: list.description,
    footerText: list.footerText,
    buttons: topThree.map(row => ({
      buttonId: row.rowId,
      buttonText: row.title.substring(0, 20), // Max 20 chars para botões
    })),
  };
}

/**
 * Gera texto de fallback caso botões falhem
 */
export function buttonsToTextFallback(message: ButtonsMessage): string {
  let text = `📋 *${message.title}*\n`;
  
  if (message.description) {
    text += `${message.description}\n`;
  }
  
  text += `\n`;
  
  message.buttons.forEach((btn, idx) => {
    text += `*${idx + 1}.* ${btn.buttonText}\n`;
  });
  
  text += `\n_Digite o número da opção desejada_`;
  
  if (message.footerText) {
    text += `\n\n_${message.footerText}_`;
  }
  
  return text;
}
