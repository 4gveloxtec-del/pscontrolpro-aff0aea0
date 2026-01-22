import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: sync-client-plans
 * ----------------------------------
 * Percorre clientes de um seller (ou TODOS) e preenche plan_id/plan_name
 * quando o cliente só tem plan_price mas não tem plan_id.
 * 
 * A lógica considera: plan_price + category + duration (baseado em expiration_date - renewed_at ou created_at)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const sellerId: string | null = body.seller_id ?? null;
    const dryRun: boolean = body.dry_run ?? false;

    // 1. Buscar clientes sem plan_id mas com plan_price
    let clientsQuery = supabase
      .from("clients")
      .select("id, seller_id, plan_price, category, expiration_date, renewed_at, created_at")
      .is("plan_id", null)
      .not("plan_price", "is", null)
      .gt("plan_price", 0);

    if (sellerId) {
      clientsQuery = clientsQuery.eq("seller_id", sellerId);
    }

    const { data: clients, error: clientsErr } = await clientsQuery;
    if (clientsErr) throw clientsErr;

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "Nenhum cliente elegível encontrado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar todos os planos (agrupados por seller)
    const sellerIds = [...new Set(clients.map((c) => c.seller_id))];
    const { data: plans, error: plansErr } = await supabase
      .from("plans")
      .select("id, seller_id, name, price, category, duration_days, screens, is_active")
      .in("seller_id", sellerIds)
      .eq("is_active", true);

    if (plansErr) throw plansErr;

    // Indexar planos por seller_id
    const plansBySeller: Record<string, typeof plans> = {};
    for (const p of plans ?? []) {
      if (!plansBySeller[p.seller_id]) plansBySeller[p.seller_id] = [];
      plansBySeller[p.seller_id].push(p);
    }

    // 3. Para cada cliente, tentar encontrar plano compatível
    const updates: { id: string; plan_id: string; plan_name: string }[] = [];

    for (const client of clients) {
      const sellerPlans = plansBySeller[client.seller_id] ?? [];
      if (sellerPlans.length === 0) continue;

      const price = Number(client.plan_price);
      const category = (client.category ?? "IPTV").toUpperCase();

      // Calcular duração aproximada
      let durationDays = 30;
      const expDate = client.expiration_date ? new Date(client.expiration_date) : null;
      const startDate = client.renewed_at
        ? new Date(client.renewed_at)
        : client.created_at
        ? new Date(client.created_at)
        : null;

      if (expDate && startDate && !isNaN(expDate.getTime()) && !isNaN(startDate.getTime())) {
        const diff = Math.round((expDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff > 0) durationDays = diff;
      }

      // Mapear duração aproximada para duração padrão
      const standardDuration = closestStandardDuration(durationDays);

      // Filtrar planos compatíveis (mesma categoria e mesmo preço)
      const candidates = sellerPlans.filter(
        (p) =>
          normalizeCategory(p.category) === normalizeCategory(category) &&
          Math.abs(p.price - price) < 0.01
      );

      if (candidates.length === 0) continue;

      // Priorizar plano com duração mais próxima
      candidates.sort(
        (a, b) =>
          Math.abs(a.duration_days - standardDuration) - Math.abs(b.duration_days - standardDuration)
      );

      const best = candidates[0];
      updates.push({ id: client.id, plan_id: best.id, plan_name: best.name });
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, wouldSync: updates.length, preview: updates.slice(0, 20) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Atualizar clientes em lote (batch de 50)
    let syncedCount = 0;
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (u) => {
          const { error } = await supabase
            .from("clients")
            .update({ plan_id: u.plan_id, plan_name: u.plan_name })
            .eq("id", u.id);
          if (!error) syncedCount++;
        })
      );
    }

    return new Response(
      JSON.stringify({ success: true, synced: syncedCount, total: clients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sync-client-plans error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function closestStandardDuration(days: number): number {
  const standards = [30, 90, 180, 365];
  let closest = 30;
  let minDiff = Math.abs(days - 30);
  for (const s of standards) {
    const diff = Math.abs(days - s);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }
  return closest;
}

function normalizeCategory(cat: string): string {
  const upper = (cat ?? "").toUpperCase().trim();
  if (upper.includes("IPTV")) return "IPTV";
  if (upper.includes("P2P")) return "P2P";
  if (upper.includes("SSH")) return "SSH";
  if (upper.includes("PREMIUM") || upper.includes("CONTAS")) return "PREMIUM";
  return upper;
}
