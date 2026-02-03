/**
 * migrate-search-columns
 * 
 * Edge Function para migrar clientes existentes, preenchendo as colunas
 * login_search, login2_search, paid_apps_email_search e phone_search.
 * 
 * Essa função descriptografa UMA VEZ cada campo e salva a versão normalizada.
 * Após a migração, a Busca 360 não precisa mais descriptografar em massa.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ Crypto Utils (inline - uses ENCRYPTION_KEY from env) ============

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

// Get encryption key directly from environment (same as crypto function)
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");

async function getKey(): Promise<CryptoKey> {
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable not set");
  }
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: ALGORITHM },
    false,
    ["decrypt"]
  );
}

async function decrypt(encryptedValue: string, key: CryptoKey): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedValue), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    // Se falhar, retorna o valor original (pode já estar em texto plano)
    return encryptedValue;
  }
}

// ============ Helpers ============

function looksEncrypted(value: string): boolean {
  if (!value || value.length < 20) return false;
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(value)) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  const hasUpperAndLower = /[A-Z]/.test(value) && /[a-z]/.test(value);
  const hasPadding = value.endsWith("=");
  const hasSpecialBase64 = /[+/]/.test(value);
  return hasUpperAndLower || hasPadding || hasSpecialBase64;
}

function normalizeForSearch(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().trim();
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  // Remove todos os caracteres não-numéricos
  return value.replace(/\D/g, "");
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse body para opções
    let options = { sellerId: null as string | null, batchSize: 100, dryRun: false };
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // Body vazio é OK
    }

    console.log("[MigrateSearch] Iniciando migração...", options);

    // Obter chave de criptografia
    const cryptoKey = await getKey();

    // Buscar clientes que precisam de migração
    let query = supabase
      .from("clients")
      .select("id, login, login_2, paid_apps_email, phone, login_search, login2_search")
      .is("login_search", null) // Apenas clientes não migrados
      .limit(options.batchSize);

    if (options.sellerId) {
      query = query.eq("seller_id", options.sellerId);
    }

    const { data: clients, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Erro ao buscar clientes: ${fetchError.message}`);
    }

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhum cliente para migrar",
          migrated: 0,
          remaining: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[MigrateSearch] Processando ${clients.length} clientes...`);

    let migrated = 0;
    let errors: string[] = [];

    for (const client of clients) {
      try {
        // Descriptografar campos se necessário
        let loginPlain = client.login;
        let login2Plain = client.login_2;
        let paidEmailPlain = client.paid_apps_email;

        if (loginPlain && looksEncrypted(loginPlain)) {
          loginPlain = await decrypt(loginPlain, cryptoKey);
        }
        if (login2Plain && looksEncrypted(login2Plain)) {
          login2Plain = await decrypt(login2Plain, cryptoKey);
        }
        if (paidEmailPlain && looksEncrypted(paidEmailPlain)) {
          paidEmailPlain = await decrypt(paidEmailPlain, cryptoKey);
        }

        // Preparar dados normalizados
        // Usar string vazia '' para indicar "processado mas sem valor" (diferente de null = não processado)
        const updateData = {
          login_search: normalizeForSearch(loginPlain) ?? '',
          login2_search: normalizeForSearch(login2Plain) ?? '',
          paid_apps_email_search: normalizeForSearch(paidEmailPlain) ?? '',
          phone_search: normalizePhone(client.phone) ?? '',
        };

        if (options.dryRun) {
          console.log(`[DryRun] Cliente ${client.id}:`, updateData);
        } else {
          const { error: updateError } = await supabase
            .from("clients")
            .update(updateData)
            .eq("id", client.id);

          if (updateError) {
            errors.push(`Cliente ${client.id}: ${updateError.message}`);
            continue;
          }
        }

        migrated++;
      } catch (err) {
        errors.push(`Cliente ${client.id}: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
      }
    }

    // Contar quantos ainda faltam
    const { count: remaining } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("login_search", null);

    console.log(`[MigrateSearch] Migração concluída. Migrados: ${migrated}, Restantes: ${remaining || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        migrated,
        remaining: remaining || 0,
        errors: errors.length > 0 ? errors : undefined,
        dryRun: options.dryRun,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MigrateSearch] Erro:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
