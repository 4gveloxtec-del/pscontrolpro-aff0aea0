import { supabase } from '@/integrations/supabase/client';

/**
 * Checks if a password has been exposed in data breaches using the
 * HaveIBeenPwned API with k-Anonymity (only first 5 chars of SHA-1 sent)
 */
export async function checkPasswordPwned(password: string): Promise<{ isPwned: boolean; count: number }> {
  try {
    // Create SHA-1 hash of password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    
    // Split hash for k-Anonymity
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);
    
    // Query HIBP API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true' // Adds padding to responses for additional privacy
      }
    });
    
    if (!response.ok) {
      console.error('HIBP API error:', response.status);
      return { isPwned: false, count: 0 };
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix.trim() === suffix) {
        return { isPwned: true, count: parseInt(count.trim(), 10) };
      }
    }
    
    return { isPwned: false, count: 0 };
  } catch (error) {
    console.error('Error checking password:', error);
    return { isPwned: false, count: 0 };
  }
}

/**
 * Validates password strength
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length >= 8) score++;
  else feedback.push('Mínimo 8 caracteres');
  
  if (password.length >= 12) score++;
  
  if (/[a-z]/.test(password)) score++;
  else feedback.push('Inclua letras minúsculas');
  
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Inclua letras maiúsculas');
  
  if (/[0-9]/.test(password)) score++;
  else feedback.push('Inclua números');
  
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else feedback.push('Inclua caracteres especiais');
  
  return {
    isValid: score >= 4 && password.length >= 8,
    score: Math.min(score, 5),
    feedback
  };
}

export function usePasswordValidation() {
  return {
    checkPasswordPwned,
    validatePasswordStrength
  };
}
