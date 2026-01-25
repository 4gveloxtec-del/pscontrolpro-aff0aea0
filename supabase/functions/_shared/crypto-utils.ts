/**
 * Utilitários de Criptografia - Compartilhado entre Edge Functions
 */

/**
 * Criptografa dados sensíveis via edge function crypto
 */
export async function encryptData(
  supabaseUrl: string, 
  serviceKey: string, 
  plaintext: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crypto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: 'encrypt', data: plaintext }),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      console.error('[crypto-utils] Encryption failed:', await response.text());
      return plaintext; // Fallback: não criptografado
    }
    
    const result = await response.json();
    return result.encrypted || plaintext;
  } catch (error) {
    console.error('[crypto-utils] Encryption error:', error);
    return plaintext;
  } finally {
    clearTimeout(timeoutId);
  }
}
