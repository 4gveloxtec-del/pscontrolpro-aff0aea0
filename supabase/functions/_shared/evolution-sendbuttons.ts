/**
 * BOT ENGINE - Sistema de Botões Interativos do WhatsApp
 * Substitui sendList por sendButtons (máximo 3 botões)
 * 
 * VANTAGENS:
 * - Maior compatibilidade com versões da Evolution API
 * - Exibição mais simples e direta no WhatsApp
 * - Máximo 3 botões por mensagem
 */

export interface ButtonOption {
  /** ID do botão (usado para identificar a seleção) */
  buttonId: string;
  /** Texto exibido no botão (max 20 chars) */
  buttonText: string;
}

export interface ButtonsMessage {
  /** Texto principal da mensagem */
  title: string;
  /** Descrição/corpo da mensagem */
  description?: string;
  /** Texto do rodapé (opcional) */
  footerText?: string;
  /** Botões (máximo 3) */
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
 * Builds multiple payload shapes for Evolution API sendButtons.
 * Different Evolution versions expect different schemas.
 */
export function buildSendButtonsPayloadVariants(
  message: ButtonsMessage,
  phoneNumber: string
): PayloadVariant[] {
  const safeTitle = ensureNonEmpty(message.title, 'Menu').substring(0, 60);
  const safeDescription = ensureNonEmpty(message.description, 'Selecione uma opção');
  const safeFooterText = ensureNonEmpty(message.footerText, ' ').substring(0, 60);

  // Limitar a 3 botões (requisito do WhatsApp)
  const limitedButtons = message.buttons.slice(0, 3);

  // Body text (título + descrição)
  const bodyText = stripMarkdown(`${safeTitle}\n\n${safeDescription}`)
    .substring(0, 1024);

  // Formato oficial WhatsApp Cloud API: { type: "reply", reply: { id, title } }
  const buttonsCloudApi = limitedButtons.map((btn, idx) => ({
    type: 'reply',
    reply: {
      id: btn.buttonId,
      title: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20),
    },
  }));

  // Formato Evolution API v2+ com type: "reply" (OBRIGATÓRIO para muitas versões)
  const buttonsWithType = limitedButtons.map((btn, idx) => ({
    type: 'reply',
    buttonId: btn.buttonId,
    buttonText: { displayText: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20) },
  }));

  // Formato simplificado com type: "reply" e id/title
  const buttonsSimpleWithType = limitedButtons.map((btn, idx) => ({
    type: 'reply',
    id: btn.buttonId,
    title: ensureNonEmpty(btn.buttonText, `Opção ${idx + 1}`).substring(0, 20),
  }));

  return [
    {
      // Formato WhatsApp Cloud API oficial (prioridade máxima)
      name: 'cloudapi.reply.buttons',
      payload: {
        number: phoneNumber,
        interactiveMessage: {
          type: 'button',
          body: { text: bodyText },
          footer: { text: stripMarkdown(safeFooterText).substring(0, 60) || ' ' },
          action: {
            buttons: buttonsCloudApi,
          },
        },
      },
    },
    {
      // Formato Evolution sendButtons com buttonId/buttonText
      name: 'evolution.buttonId.displayText',
      payload: {
        number: phoneNumber,
        title: safeTitle,
        description: stripMarkdown(safeDescription).substring(0, 1024),
        footer: stripMarkdown(safeFooterText).substring(0, 60) || ' ',
        buttons: buttonsWithType,
      },
    },
    {
      // Formato simplificado com id/title (flat)
      name: 'evolution.id.title',
      payload: {
        number: phoneNumber,
        title: safeTitle,
        description: stripMarkdown(safeDescription).substring(0, 1024),
        footer: stripMarkdown(safeFooterText).substring(0, 60) || ' ',
        buttons: buttonsSimpleWithType,
      },
    },
    {
      // Formato aninhado interactive.action.buttons
      name: 'interactive.action.buttons',
      payload: {
        number: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          footer: { text: stripMarkdown(safeFooterText).substring(0, 60) || ' ' },
          action: {
            buttons: buttonsCloudApi,
          },
        },
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
