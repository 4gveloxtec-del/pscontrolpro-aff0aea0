import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  isTrialUser?: boolean;
  hoursRemaining?: number;
  shouldStartTimer?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get seller_id from request
    const { seller_id, action } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: "seller_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get seller profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_permanent, subscription_expires_at, is_active, api_trial_started_at, created_at')
      .eq('id', seller_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ allowed: false, reason: 'Perfil não encontrado' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is active
    if (!profile.is_active) {
      return new Response(
        JSON.stringify({ allowed: false, reason: 'Conta desativada' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Permanent users always have access
    if (profile.is_permanent) {
      return new Response(
        JSON.stringify({ allowed: true, isTrialUser: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();

    // Check if user has a paid plan (subscription not expired)
    if (profile.subscription_expires_at) {
      const expiresAt = new Date(profile.subscription_expires_at);
      
      if (expiresAt > now) {
        // Has valid paid plan
        return new Response(
          JSON.stringify({ allowed: true, isTrialUser: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // User is in trial or expired - check trial API settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['trial_api_enabled', 'trial_api_hours', 'seller_trial_days']);

    const trialApiEnabled = settings?.find(s => s.key === 'trial_api_enabled')?.value === 'true';
    const trialApiHours = parseInt(settings?.find(s => s.key === 'trial_api_hours')?.value || '24', 10);

    // Check if trial period is still valid
    const trialEndsAt = profile.subscription_expires_at 
      ? new Date(profile.subscription_expires_at) 
      : null;

    if (!trialEndsAt || trialEndsAt <= now) {
      return new Response(
        JSON.stringify({ 
          allowed: false, 
          reason: 'Período de teste expirado. Ative seu plano para usar a API.',
          isTrialUser: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trial is still valid - check if API is allowed
    if (!trialApiEnabled) {
      return new Response(
        JSON.stringify({ 
          allowed: false, 
          reason: 'WhatsApp API não disponível durante o período de teste. Ative seu plano para desbloquear.',
          isTrialUser: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // API is allowed in trial - check time limit
    if (profile.api_trial_started_at) {
      const apiStartedAt = new Date(profile.api_trial_started_at);
      const hoursUsed = (now.getTime() - apiStartedAt.getTime()) / (1000 * 60 * 60);
      const hoursRemaining = trialApiHours - hoursUsed;

      if (hoursRemaining <= 0) {
        return new Response(
          JSON.stringify({ 
            allowed: false, 
            reason: `Tempo de uso da API esgotado (${trialApiHours}h). Ative seu plano para continuar.`,
            isTrialUser: true,
            hoursRemaining: 0
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          allowed: true, 
          isTrialUser: true,
          hoursRemaining: Math.max(0, hoursRemaining)
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // API timer not started yet
    if (action === 'start_timer') {
      // Start the API trial timer
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ api_trial_started_at: now.toISOString() })
        .eq('id', seller_id);

      if (updateError) {
        console.error('Error starting API timer:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          allowed: true, 
          isTrialUser: true,
          hoursRemaining: trialApiHours,
          timerStarted: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Timer not started, API available
    return new Response(
      JSON.stringify({ 
        allowed: true, 
        isTrialUser: true,
        hoursRemaining: trialApiHours,
        shouldStartTimer: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error('Error in validate-api-access:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
