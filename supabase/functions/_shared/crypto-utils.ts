/**
 * Utilitários de Criptografia - Compartilhado entre Edge Functions
 * 
 * CORREÇÕES APLICADAS:
 * - [#8] Não retorna plaintext em caso de falha - retorna string vazia e loga erro
 * - [#12] Adiciona retry com backoff exponencial
 */

/**
 * Criptografa dados sensíveis via edge function crypto
 * 
 * @returns string criptografada ou string vazia em caso de falha
 * IMPORTANTE: Verifica o retorno antes de salvar no banco!
 */
export async function encryptData(
  supabaseUrl: string, 
  serviceKey: string, 
  plaintext: string
): Promise<string> {
  if (!plaintext || !plaintext.trim()) {
    return '';
  }

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      // [#12] CORREÇÃO: Backoff exponencial entre tentativas
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        console.log(`[crypto-utils] Retry attempt ${attempt} for encryption`);
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/crypto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ action: 'encrypt', data: plaintext }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[crypto-utils] Encryption failed (${response.status}):`, errorText);
        lastError = new Error(`Encryption failed: ${response.status}`);
        continue;
      }
      
      const result = await response.json();
      
      if (result.encrypted && typeof result.encrypted === 'string') {
        return result.encrypted;
      }
      
      console.error('[crypto-utils] Invalid encryption response:', result);
      lastError = new Error('Invalid encryption response');
      
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[crypto-utils] Encryption error (attempt ${attempt}):`, lastError.message);
    }
  }

  // [#8] CORREÇÃO: NÃO retorna plaintext - retorna vazio e loga erro crítico
  console.error('[crypto-utils] ❌ CRITICAL: All encryption attempts failed. Returning empty string to prevent plaintext storage.');
  console.error('[crypto-utils] Last error:', lastError?.message);
  
  // Retorna vazio - o código chamador deve verificar e lidar com isso
  return '';
}

/**
 * Descriptografa dados via edge function crypto
 */
export async function decryptData(
  supabaseUrl: string, 
  serviceKey: string, 
  encrypted: string
): Promise<string> {
  if (!encrypted || !encrypted.trim()) {
    return '';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crypto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: 'decrypt', data: encrypted }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('[crypto-utils] Decryption failed:', await response.text());
      return '';
    }
    
    const result = await response.json();
    return result.decrypted || '';
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[crypto-utils] Decryption error:', error);
    return '';
  }
}

/**
 * Verifica se uma string parece estar criptografada
 * (útil para evitar criptografia dupla)
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  
  // Padrão típico de dados criptografados em base64 com prefixo
  return value.startsWith('enc:') || 
         value.startsWith('ENC:') || 
         (value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value));
}
