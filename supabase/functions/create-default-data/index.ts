import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating default data for: ${email}`);

    // Find user by email in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found', details: profileError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = profile.id;
    console.log(`Found user ID: ${userId}`);

    // Check existing plans
    const { data: existingPlans, error: plansError } = await supabase
      .from('plans')
      .select('id')
      .eq('seller_id', userId);

    if (plansError) {
      console.error('Error checking plans:', plansError);
    }

    console.log(`Existing plans count: ${existingPlans?.length || 0}`);

    // Create default plans if none exist
    if (!existingPlans || existingPlans.length === 0) {
      const defaultPlans = [
        // IPTV (1-3 telas) - Mensal/Trimestral/Semestral/Anual
        { seller_id: userId, name: 'IPTV 1 Tela Mensal', price: 0, duration_days: 30, category: 'IPTV', screens: 1, is_active: true },
        { seller_id: userId, name: 'IPTV 2 Telas Mensal', price: 0, duration_days: 30, category: 'IPTV', screens: 2, is_active: true },
        { seller_id: userId, name: 'IPTV 3 Telas Mensal', price: 0, duration_days: 30, category: 'IPTV', screens: 3, is_active: true },
        { seller_id: userId, name: 'IPTV 1 Tela Trimestral', price: 0, duration_days: 90, category: 'IPTV', screens: 1, is_active: true },
        { seller_id: userId, name: 'IPTV 2 Telas Trimestral', price: 0, duration_days: 90, category: 'IPTV', screens: 2, is_active: true },
        { seller_id: userId, name: 'IPTV 3 Telas Trimestral', price: 0, duration_days: 90, category: 'IPTV', screens: 3, is_active: true },
        { seller_id: userId, name: 'IPTV 1 Tela Semestral', price: 0, duration_days: 180, category: 'IPTV', screens: 1, is_active: true },
        { seller_id: userId, name: 'IPTV 2 Telas Semestral', price: 0, duration_days: 180, category: 'IPTV', screens: 2, is_active: true },
        { seller_id: userId, name: 'IPTV 3 Telas Semestral', price: 0, duration_days: 180, category: 'IPTV', screens: 3, is_active: true },
        { seller_id: userId, name: 'IPTV 1 Tela Anual', price: 0, duration_days: 365, category: 'IPTV', screens: 1, is_active: true },
        { seller_id: userId, name: 'IPTV 2 Telas Anual', price: 0, duration_days: 365, category: 'IPTV', screens: 2, is_active: true },
        { seller_id: userId, name: 'IPTV 3 Telas Anual', price: 0, duration_days: 365, category: 'IPTV', screens: 3, is_active: true },

        // P2P (1-3 telas) - Mensal/Trimestral/Semestral/Anual
        { seller_id: userId, name: 'P2P 1 Tela Mensal', price: 0, duration_days: 30, category: 'P2P', screens: 1, is_active: true },
        { seller_id: userId, name: 'P2P 2 Telas Mensal', price: 0, duration_days: 30, category: 'P2P', screens: 2, is_active: true },
        { seller_id: userId, name: 'P2P 3 Telas Mensal', price: 0, duration_days: 30, category: 'P2P', screens: 3, is_active: true },
        { seller_id: userId, name: 'P2P 1 Tela Trimestral', price: 0, duration_days: 90, category: 'P2P', screens: 1, is_active: true },
        { seller_id: userId, name: 'P2P 2 Telas Trimestral', price: 0, duration_days: 90, category: 'P2P', screens: 2, is_active: true },
        { seller_id: userId, name: 'P2P 3 Telas Trimestral', price: 0, duration_days: 90, category: 'P2P', screens: 3, is_active: true },
        { seller_id: userId, name: 'P2P 1 Tela Semestral', price: 0, duration_days: 180, category: 'P2P', screens: 1, is_active: true },
        { seller_id: userId, name: 'P2P 2 Telas Semestral', price: 0, duration_days: 180, category: 'P2P', screens: 2, is_active: true },
        { seller_id: userId, name: 'P2P 3 Telas Semestral', price: 0, duration_days: 180, category: 'P2P', screens: 3, is_active: true },
        { seller_id: userId, name: 'P2P 1 Tela Anual', price: 0, duration_days: 365, category: 'P2P', screens: 1, is_active: true },
        { seller_id: userId, name: 'P2P 2 Telas Anual', price: 0, duration_days: 365, category: 'P2P', screens: 2, is_active: true },
        { seller_id: userId, name: 'P2P 3 Telas Anual', price: 0, duration_days: 365, category: 'P2P', screens: 3, is_active: true },

        // SSH (1-2 logins) - Mensal/Trimestral/Semestral/Anual
        { seller_id: userId, name: 'SSH 1 Login Mensal', price: 0, duration_days: 30, category: 'SSH', screens: 1, is_active: true },
        { seller_id: userId, name: 'SSH 2 Logins Mensal', price: 0, duration_days: 30, category: 'SSH', screens: 2, is_active: true },
        { seller_id: userId, name: 'SSH 1 Login Trimestral', price: 0, duration_days: 90, category: 'SSH', screens: 1, is_active: true },
        { seller_id: userId, name: 'SSH 2 Logins Trimestral', price: 0, duration_days: 90, category: 'SSH', screens: 2, is_active: true },
        { seller_id: userId, name: 'SSH 1 Login Semestral', price: 0, duration_days: 180, category: 'SSH', screens: 1, is_active: true },
        { seller_id: userId, name: 'SSH 2 Logins Semestral', price: 0, duration_days: 180, category: 'SSH', screens: 2, is_active: true },
        { seller_id: userId, name: 'SSH 1 Login Anual', price: 0, duration_days: 365, category: 'SSH', screens: 1, is_active: true },
        { seller_id: userId, name: 'SSH 2 Logins Anual', price: 0, duration_days: 365, category: 'SSH', screens: 2, is_active: true },
      ];

      const { error: insertPlansError } = await supabase
        .from('plans')
        .insert(defaultPlans);

      if (insertPlansError) {
        console.error('Error creating plans:', insertPlansError);
        return new Response(
          JSON.stringify({ error: 'Failed to create plans', details: insertPlansError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Default plans created successfully');
    }

    // Check existing templates
    const { data: existingTemplates } = await supabase
      .from('whatsapp_templates')
      .select('id')
      .eq('seller_id', userId);

    console.log(`Existing templates count: ${existingTemplates?.length || 0}`);

    // Create default templates if none exist
    if (!existingTemplates || existingTemplates.length === 0) {
      // Call the database function to create templates
      const { error: templatesError } = await supabase.rpc('create_default_templates_for_seller', {
        seller_uuid: userId
      });

      if (templatesError) {
        console.error('Error creating templates:', templatesError);
      } else {
        console.log('Default templates created successfully');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Default data created for ${email}`,
        user_id: userId,
        plans_created: !existingPlans || existingPlans.length === 0,
        templates_created: !existingTemplates || existingTemplates.length === 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
