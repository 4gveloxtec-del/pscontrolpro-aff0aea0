import type { InteractiveListMessage } from "./interactive-list.ts";

type PayloadVariant = {
  name: string;
  payload: unknown;
};

function stripMarkdown(input: string): string {
  // WhatsApp list bodies may reject/behave oddly with markdown markers.
  // Keep emojis and punctuation; only remove common formatting tokens.
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
 * Builds multiple payload shapes for Evolution API sendList.
 * Different Evolution versions/instances expect different schemas.
 */
export function buildSendListPayloadVariants(
  list: InteractiveListMessage,
  phoneNumber: string
): PayloadVariant[] {
  const safeTitle = ensureNonEmpty(list.title, 'Menu').substring(0, 60);
  const safeDescription = ensureNonEmpty(list.description, 'Selecione uma opção');
  const safeButtonText = ensureNonEmpty(list.buttonText, 'Ver opções').substring(0, 20);
  const safeFooterText = ensureNonEmpty(list.footerText, ' ').substring(0, 60);

  const bodyText = stripMarkdown(`${safeTitle}\n\n${safeDescription}`)
    .substring(0, 1024);

  const sectionsWithId = list.sections.map((section) => ({
    title: ensureNonEmpty(section.title, 'Opções').substring(0, 24),
    rows: section.rows.map((row) => ({
      id: row.rowId,
      title: ensureNonEmpty(row.title, 'Opção').substring(0, 24),
      description: ensureNonEmpty(row.description, ' ').substring(0, 72),
    })),
  }));

  const valuesWithRowId = list.sections.map((section) => ({
    title: ensureNonEmpty(section.title, 'Opções').substring(0, 24),
    rows: section.rows.map((row) => ({
      title: ensureNonEmpty(row.title, 'Opção').substring(0, 24),
      description: ensureNonEmpty(row.description, ' ').substring(0, 72),
      rowId: row.rowId,
    })),
  }));

  return [
    {
      // Newer Evolution schema (nested interactive)
      name: 'interactive.sections.id',
      payload: {
        number: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          footer: { text: stripMarkdown(safeFooterText).substring(0, 60) || ' ' },
          action: {
            button: stripMarkdown(safeButtonText).substring(0, 20),
            sections: sectionsWithId,
          },
        },
      },
    },
    {
      // Older schema seen in some instances (flat + sections)
      name: 'flat.sections.id',
      payload: {
        number: phoneNumber,
        title: safeTitle,
        description: stripMarkdown(safeDescription).substring(0, 1024),
        buttonText: stripMarkdown(safeButtonText).substring(0, 20),
        footerText: stripMarkdown(safeFooterText).substring(0, 60) || ' ',
        sections: sectionsWithId,
      },
    },
    {
      // Alternative schema (flat + values + rowId)
      name: 'flat.values.rowId',
      payload: {
        number: phoneNumber,
        title: safeTitle,
        description: stripMarkdown(safeDescription).substring(0, 1024),
        buttonText: stripMarkdown(safeButtonText).substring(0, 20),
        footerText: stripMarkdown(safeFooterText).substring(0, 60) || ' ',
        values: valuesWithRowId,
      },
    },
  ];
}
