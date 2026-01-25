/**
 * Utilitários de Telefone - Compartilhado entre Edge Functions
 * Normalização padronizada para formato brasileiro
 * 
 * CORREÇÕES APLICADAS:
 * - [#1] Retorno consistente (string vazia em vez de null para uniformidade)
 * - [#13] Telefones sem DDI recebem log de aviso e tentativa de completar
 */

/**
 * Normaliza telefone para padrão brasileiro com DDI 55
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se não existir
 * - Garante formato consistente
 * 
 * @returns string normalizada ou string vazia se inválido
 */
export function normalizePhoneWithDDI(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, '');
  
  // [#1] CORREÇÃO: Validação mais rigorosa
  if (digits.length < 10) {
    console.log(`[phone-utils] Phone too short (${digits.length} digits): ${digits}`);
    return '';
  }
  
  // Se começa com 55 e tem 12-13 dígitos, já está correto
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  
  // Se tem 10-11 dígitos (DDD + número brasileiro), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return '55' + digits;
  }
  
  // [#13] CORREÇÃO: Números internacionais ou muito grandes - manter como está
  // mas logar para investigação
  if (digits.length > 13) {
    console.log(`[phone-utils] International or unusual phone format: ${digits}`);
    return digits;
  }
  
  // Fallback: retornar como está se passou validação mínima
  return digits;
}

/**
 * Versão que retorna null para compatibilidade com código legado
 * Use normalizePhoneWithDDI para novo código
 */
export function normalizePhoneWithDDIOrNull(phone: string | null | undefined): string | null {
  const result = normalizePhoneWithDDI(phone);
  return result || null;
}

/**
 * Formata telefone brasileiro para exibição: +55 31 99999-9999
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Valida se um telefone está no formato brasileiro válido
 */
export function isValidBrazilianPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  
  const digits = phone.replace(/\D/g, '');
  
  // Deve ter entre 12-13 dígitos com DDI 55
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return true;
  }
  
  // Ou 10-11 dígitos sem DDI (será normalizado)
  if (digits.length >= 10 && digits.length <= 11) {
    return true;
  }
  
  return false;
}
