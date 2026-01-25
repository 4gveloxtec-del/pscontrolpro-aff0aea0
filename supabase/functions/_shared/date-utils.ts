/**
 * Utilitários de Data - Compartilhado entre Edge Functions
 * Parsing de datas em múltiplos formatos
 */

/**
 * Parseia data no formato brasileiro ou ISO
 * Suporta: dd/MM/yyyy, dd/MM/yyyy HH:mm:ss, yyyy-MM-dd
 */
export function parseExpirationDate(dateStr: string | undefined): Date | null {
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
 * Formata data para exibição no padrão brasileiro
 */
export function formatDateBR(date: Date): string {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Retorna data de expiração formatada para ISO (apenas data)
 */
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}
