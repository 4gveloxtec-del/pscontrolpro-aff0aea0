/**
 * Utilitários de Objeto - Compartilhado entre Edge Functions
 */

/**
 * Extrai valor de um objeto usando notação de ponto (ex: "data.credentials.login")
 */
export function extractByPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return undefined;
  
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Verifica se um valor é nulo, undefined ou string vazia
 */
export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || 
    (typeof value === 'string' && value.trim() === '');
}
