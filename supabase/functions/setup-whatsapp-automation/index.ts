import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const results: { step: string; status: string; error?: string }[] = [];

    // Check if tables exist by trying to select from them
    const tables = ['whatsapp_api_config', 'client_notification_tracking', 'reseller_notification_tracking'];
    const existingTables: string[] = [];

    for (const table of tables) {
      try {
        const { error } = await supabaseAdmin.from(table).select('id').limit(1);
        if (!error) {
          existingTables.push(table);
          results.push({ step: `Check ${table}`, status: 'exists' });
        } else if (error.code === '42P01') {
          results.push({ step: `Check ${table}`, status: 'not_found' });
        } else {
          results.push({ step: `Check ${table}`, status: 'error', error: error.message });
        }
      } catch (e) {
        results.push({ step: `Check ${table}`, status: 'error', error: String(e) });
      }
    }

    // If tables don't exist, we need to create them via migration
    const missingTables = tables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      // Return SQL that needs to be executed manually
      const createSQL = `
-- Execute this SQL in your database to create the WhatsApp tables:

-- Tabela de configuração da API WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_api_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_url TEXT NOT NULL DEFAULT '',
  api_token TEXT NOT NULL DEFAULT '',
  instance_name TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN DEFAULT false,
  auto_send_enabled BOOLEAN DEFAULT false,
  last_connection_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Tabela de rastreamento de notificações de clientes
CREATE TABLE IF NOT EXISTS public.client_notification_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  expiration_cycle_date DATE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_via TEXT DEFAULT 'manual',
  service_type TEXT,
  UNIQUE(client_id, notification_type, expiration_cycle_date)
);

-- Tabela de rastreamento de notificações de revendedores
CREATE TABLE IF NOT EXISTS public.reseller_notification_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  expiration_cycle_date DATE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reseller_id, notification_type, expiration_cycle_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_user ON public.whatsapp_api_config(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notification_client ON public.client_notification_tracking(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notification_seller ON public.client_notification_tracking(seller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_notification_reseller ON public.reseller_notification_tracking(reseller_id);

-- RLS
ALTER TABLE public.whatsapp_api_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notification_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_notification_tracking ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para whatsapp_api_config
CREATE POLICY "Users can view own config" ON public.whatsapp_api_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own config" ON public.whatsapp_api_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own config" ON public.whatsapp_api_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own config" ON public.whatsapp_api_config FOR DELETE USING (auth.uid() = user_id);

-- Políticas RLS para client_notification_tracking
CREATE POLICY "Users can view own notifications" ON public.client_notification_tracking FOR SELECT USING (auth.uid() = seller_id);
CREATE POLICY "Users can insert own notifications" ON public.client_notification_tracking FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Users can delete own notifications" ON public.client_notification_tracking FOR DELETE USING (auth.uid() = seller_id);

-- Políticas RLS para reseller_notification_tracking
CREATE POLICY "Admins can view reseller notifications" ON public.reseller_notification_tracking FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert reseller notifications" ON public.reseller_notification_tracking FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete reseller notifications" ON public.reseller_notification_tracking FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
      `;

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Tables need to be created. Please create them via Lovable Cloud migration.",
          missingTables,
          existingTables,
          results,
          sql: createSQL.trim()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "All WhatsApp tables already exist!",
        existingTables,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});