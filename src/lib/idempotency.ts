// Shared idempotency helpers used to prevent NEW duplicate rows.
// IMPORTANT: These helpers MUST NOT delete or rewrite existing data.

import { normalizeWhatsAppNumber } from "@/lib/utils";

export const normalizeNameKey = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export function normalizeClientPhone(value: string | null | undefined): string | null {
  return normalizeWhatsAppNumber(value);
}

export async function fetchExistingClientIdsByPhone(
  supabaseClient: any,
  sellerId: string,
  phones: Array<string | null>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(phones.filter(Boolean))) as string[];
  const map = new Map<string, string>();
  if (!sellerId || unique.length === 0) return map;

  // Supabase default limit is 1000 rows; keep batches small and safe.
  const batchSize = 200;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const { data, error } = await supabaseClient
      .from("clients")
      .select("id, phone")
      .eq("seller_id", sellerId)
      .in("phone", batch);

    if (error) throw error;
    for (const row of (data || []) as Array<{ id: string; phone: string | null }>) {
      if (row.phone) map.set(row.phone, row.id);
    }
  }

  return map;
}

export async function ensureTemplateExistsOrCreate(
  supabaseClient: any,
  sellerId: string,
  template: { name: string; type: string; message: string; is_default?: boolean }
): Promise<{ created: boolean; templateId?: string }>
{
  const nameKey = normalizeNameKey(template.name);
  const type = String(template.type || "");

  // Fetch only same-type templates; compare normalized name in JS (no DB migration/index).
  const { data: existing, error: fetchError } = await supabaseClient
    .from("whatsapp_templates")
    .select("id, name")
    .eq("seller_id", sellerId)
    .eq("type", type);

  if (fetchError) throw fetchError;

  const hit = (existing || []).find((t: any) => normalizeNameKey(t.name) === nameKey);
  if (hit?.id) return { created: false, templateId: hit.id };

  const { data: inserted, error: insertError } = await supabaseClient
    .from("whatsapp_templates")
    .insert({
      seller_id: sellerId,
      name: template.name,
      type,
      message: template.message,
      is_default: template.is_default ?? false,
    })
    .select("id")
    .maybeSingle();

  if (insertError) throw insertError;
  return { created: true, templateId: inserted?.id };
}

export async function ensureClientNotificationTracking(
  supabaseClient: any,
  params: {
    seller_id: string;
    client_id: string;
    notification_type: string;
    expiration_cycle_date: string;
    sent_via: string;
    service_type?: string;
  }
): Promise<{ inserted: boolean }>
{
  const { seller_id, client_id, notification_type, expiration_cycle_date, sent_via, service_type } = params;
  if (!seller_id || !client_id || !notification_type || !expiration_cycle_date) return { inserted: false };

  const { data: existing, error: existsError } = await supabaseClient
    .from("client_notification_tracking")
    .select("id")
    .eq("seller_id", seller_id)
    .eq("client_id", client_id)
    .eq("notification_type", notification_type)
    .eq("expiration_cycle_date", expiration_cycle_date)
    .maybeSingle();

  if (existsError) {
    // If tracking table isn't available for some reason, don't break messaging.
    return { inserted: false };
  }

  if (existing?.id) return { inserted: false };

  const { error: insertError } = await supabaseClient.from("client_notification_tracking").insert({
    seller_id,
    client_id,
    notification_type,
    expiration_cycle_date,
    sent_via,
    ...(service_type ? { service_type } : {}),
  });

  if (insertError) {
    // Do not throw: duplicate-prevention should never block the main action.
    return { inserted: false };
  }

  return { inserted: true };
}
