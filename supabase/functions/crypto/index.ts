// Crypto edge function - handles encryption/decryption with AES-256-GCM
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Zod schema for crypto request validation
const cryptoSchema = z.object({
  action: z.enum(['encrypt', 'decrypt'], {
    errorMap: () => ({ message: 'Action must be "encrypt" or "decrypt"' })
  }),
  data: z.string()
    .min(1, "Data cannot be empty")
    .max(100000, "Data too large (max 100KB)"),
});

// AES-256-GCM encryption/decryption
// SECURITY: Require encryption key from environment - no insecure fallback
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');

if (!ENCRYPTION_KEY) {
  console.error('CRITICAL: ENCRYPTION_KEY environment variable not set');
}

async function getKey(): Promise<CryptoKey> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext: string): Promise<string> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }
  
  const key = await getKey();
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(ciphertext: string): Promise<string> {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key not configured');
    }
    
    // Check if the data looks like base64-encoded encrypted data
    // Valid AES-GCM encrypted data should be at least 12 bytes (IV) + some encrypted content
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(ciphertext) || ciphertext.length < 20) {
      // Data doesn't look encrypted, return as-is
      return ciphertext;
    }
    
    const key = await getKey();
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    
    // Validate minimum length (12 bytes IV + at least some encrypted data)
    if (combined.length < 13) {
      return ciphertext;
    }
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  } catch {
    // If decryption fails, the data might not be encrypted - return original
    return ciphertext;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization header for security
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate payload with Zod
    const rawBody = await req.json();
    const validationResult = cryptoSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      console.log('[crypto] Validation failed:', errors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, data } = validationResult.data;
    
    console.log(`Crypto action: ${action}`);

    let result: string;
    
    if (action === 'encrypt') {
      result = await encrypt(data);
    } else {
      result = await decrypt(data);
    }

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Crypto error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});