import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64url encode/decode helpers
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - str.length % 4) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper to convert Uint8Array to ArrayBuffer
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(arr.length);
  new Uint8Array(buffer).set(arr);
  return buffer;
}

// Create proper VAPID JWT token
async function createVapidJWT(
  audience: string, 
  subject: string, 
  publicKeyBase64: string,
  privateKeyBase64: string
): Promise<{ token: string; publicKey: string }> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: subject,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Decode the keys from base64url
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  const publicKeyBytes = base64UrlDecode(publicKeyBase64);
  
  // Extract x and y from public key (uncompressed point format: 04 || x || y)
  let x: Uint8Array, y: Uint8Array;
  if (publicKeyBytes[0] === 0x04 && publicKeyBytes.length === 65) {
    x = publicKeyBytes.slice(1, 33);
    y = publicKeyBytes.slice(33, 65);
  } else {
    x = publicKeyBytes.slice(0, 32);
    y = publicKeyBytes.slice(32, 64);
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: privateKeyBase64,
  };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const rawSig = new Uint8Array(signature);
  const signatureB64 = base64UrlEncode(rawSig);
  
  return {
    token: `${unsignedToken}.${signatureB64}`,
    publicKey: publicKeyBase64
  };
}

// Encrypt payload for Web Push (aes128gcm)
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<Uint8Array | null> {
  try {
    // Generate local ECDH key pair
    const localKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Export local public key
    const localPublicKeyBuffer = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
    const localPublicKey = new Uint8Array(localPublicKeyBuffer);

    // Import client's public key
    const clientPublicKeyBytes = base64UrlDecode(p256dh);
    const clientPublicKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(clientPublicKeyBytes),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // Derive shared secret
    const sharedSecretBuffer = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      localKeyPair.privateKey,
      256
    );
    const sharedSecret = new Uint8Array(sharedSecretBuffer);

    // Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Decode auth secret
    const authSecret = base64UrlDecode(auth);

    // Build info for auth HKDF
    const authInfoPrefix = new TextEncoder().encode('WebPush: info\0');
    const authInfo = new Uint8Array(authInfoPrefix.length + clientPublicKeyBytes.length + localPublicKey.length);
    authInfo.set(authInfoPrefix, 0);
    authInfo.set(clientPublicKeyBytes, authInfoPrefix.length);
    authInfo.set(localPublicKey, authInfoPrefix.length + clientPublicKeyBytes.length);

    // HKDF to derive IKM
    const sharedSecretKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(sharedSecret),
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    const ikmBuffer = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: toArrayBuffer(authSecret),
        info: toArrayBuffer(authInfo),
      },
      sharedSecretKey,
      256
    );
    const ikm = new Uint8Array(ikmBuffer);

    // Derive CEK and nonce
    const ikmKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(ikm),
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
    const cekBuffer = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: toArrayBuffer(salt),
        info: toArrayBuffer(cekInfo),
      },
      ikmKey,
      128
    );

    const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
    const nonceBuffer = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: toArrayBuffer(salt),
        info: toArrayBuffer(nonceInfo),
      },
      ikmKey,
      96
    );

    // Import CEK for AES-GCM
    const cek = await crypto.subtle.importKey(
      'raw',
      cekBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Pad payload and encrypt
    const payloadBytes = new TextEncoder().encode(payload);
    const paddedPayload = new Uint8Array(payloadBytes.length + 1);
    paddedPayload.set(payloadBytes, 0);
    paddedPayload[payloadBytes.length] = 2; // Delimiter

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonceBuffer,
      },
      cek,
      paddedPayload
    );
    const encrypted = new Uint8Array(encryptedBuffer);

    // Build aes128gcm body: header + encrypted
    const recordSize = 4096;
    const header = new Uint8Array(86);
    header.set(salt, 0);
    header[16] = (recordSize >> 24) & 0xff;
    header[17] = (recordSize >> 16) & 0xff;
    header[18] = (recordSize >> 8) & 0xff;
    header[19] = recordSize & 0xff;
    header[20] = 65; // keyid length
    header.set(localPublicKey, 21);

    const body = new Uint8Array(header.length + encrypted.length);
    body.set(header, 0);
    body.set(encrypted, header.length);

    return body;
  } catch (error) {
    console.error('[send-push] Encryption error:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, title, body, data, icon, tag } = await req.json();
    
    console.log('[send-push] Request for userId:', userId);
    
    if (!userId || !title) {
      throw new Error('userId and title are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@pscontrol.app';

    console.log('[send-push] VAPID keys present:', !!vapidPublicKey, !!vapidPrivateKey);

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (subError) {
      throw new Error(`Error fetching subscriptions: ${subError.message}`);
    }

    console.log('[send-push] Found subscriptions:', subscriptions?.length || 0);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'default',
      data: data || {},
    });

    let sent = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      try {
        const endpoint = sub.endpoint;
        const url = new URL(endpoint);
        const audience = `${url.protocol}//${url.host}`;

        console.log('[send-push] Processing:', sub.id);
        
        // Create VAPID JWT
        const { token } = await createVapidJWT(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);
        
        // Encrypt the payload
        const encryptedBody = await encryptPayload(payload, sub.p256dh, sub.auth);
        
        if (!encryptedBody) {
          console.error('[send-push] Encryption failed for:', sub.id);
          failed.push(sub.id);
          continue;
        }

        // Send the push notification
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `vapid t=${token}, k=${vapidPublicKey}`,
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
          },
          body: toArrayBuffer(encryptedBody),
        });

        console.log('[send-push] Response:', response.status);

        if (response.ok || response.status === 201) {
          sent++;
          console.log('[send-push] Success:', sub.id);
        } else if (response.status === 410 || response.status === 404) {
          console.log('[send-push] Subscription expired:', sub.id);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          failed.push(sub.id);
        } else {
          const errorText = await response.text();
          console.error('[send-push] Failed:', response.status, errorText);
          failed.push(sub.id);
        }
      } catch (error) {
        console.error('[send-push] Error for:', sub.id, error);
        failed.push(sub.id);
      }
    }

    console.log('[send-push] Done - sent:', sent, 'failed:', failed.length);

    return new Response(JSON.stringify({ sent, failed: failed.length, total: subscriptions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[send-push] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
