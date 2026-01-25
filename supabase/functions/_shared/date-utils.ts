/**
 * Utilitários de Data - Compartilhado entre Edge Functions
 * Parsing de datas em múltiplos formatos
 * 
 * CORREÇÕES APLICADAS:
 * - [#7] Preserva horário quando presente (HH:mm:ss)
 */

/**
 * Parseia data no formato brasileiro ou ISO
 * Suporta: dd/MM/yyyy, dd/MM/yyyy HH:mm:ss, yyyy-MM-dd, yyyy-MM-ddTHH:mm:ss
 * 
 * [#7] CORREÇÃO: Agora preserva horário quando presente
 */
export function parseExpirationDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  // Formato: dd/MM/yyyy HH:mm:ss
  const brFullMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (brFullMatch) {
    const [, day, month, year, hour, minute, second] = brFullMatch;
    return new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day), 
      parseInt(hour), 
      parseInt(minute), 
      parseInt(second)
    );
  }
  
  // Formato: dd/MM/yyyy HH:mm (sem segundos)
  const brPartialMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (brPartialMatch) {
    const [, day, month, year, hour, minute] = brPartialMatch;
    return new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day), 
      parseInt(hour), 
      parseInt(minute), 
      0
    );
  }
  
  // Formato: dd/MM/yyyy (apenas data - usa meio-dia para evitar problemas de fuso)
  const brDateMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  // Formato ISO completo: yyyy-MM-ddTHH:mm:ss ou yyyy-MM-ddTHH:mm:ssZ
  const isoFullMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoFullMatch) {
    // Usar Date constructor direto para ISO - ele preserva o horário
    return new Date(dateStr);
  }
  
  // Formato ISO apenas data: yyyy-MM-dd
  const isoDateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  
  // Tentar parse genérico como fallback
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Ignore parse error
  }
  
  console.log(`[date-utils] Could not parse date: ${dateStr}`);
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

/**
 * Valida se uma data é válida (não NaN)
 * [#16] Útil para validar datas antes de usar
 */
export function isValidDate(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Retorna data padrão (agora + X horas) se a data fornecida for inválida
 */
export function getValidDateOrDefault(date: Date | null | undefined, defaultHoursFromNow: number = 2): Date {
  if (isValidDate(date)) {
    return date!;
  }
  
  const defaultDate = new Date();
  defaultDate.setHours(defaultDate.getHours() + defaultHoursFromNow);
  return defaultDate;
}
