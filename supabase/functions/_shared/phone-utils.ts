/**
 * Utilitários de Telefone - Compartilhado entre Edge Functions
 * Normalização padronizada para formato brasileiro
 */

/**
 * Normaliza telefone para padrão brasileiro com DDI 55
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se não existir
 * - Garante formato consistente
 */
export function normalizePhoneWithDDI(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 8) {
    console.log(`[phone-utils] Phone too short: ${digits}`);
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
  if (digits.length >= 8 && digits.length <= 9) {
    console.log(`[phone-utils] Phone without DDD: ${digits}, keeping as-is`);
    return digits;
  }
  
  // Se já é um número grande (provavelmente internacional), manter como está
  return digits;
}

/**
 * Formata telefone brasileiro para exibição: +55 31 99999-9999
 */
export function formatPhoneDisplay(phone: string): string {
  if (phone.length === 13) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 9)}-${phone.slice(9)}`;
  }
  if (phone.length === 12) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
  }
  return phone;
}
