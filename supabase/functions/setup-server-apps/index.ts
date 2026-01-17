import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;

    console.log('Creating server_apps table...');

    // Connect directly to database using postgres
    const { Client } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts');
    
    const client = new Client(dbUrl);
    await client.connect();

    // Check if table exists
    const checkResult = await client.queryObject(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'server_apps'
      );
    `);

    const tableExists = (checkResult.rows[0] as { exists: boolean }).exists;
    
    if (tableExists) {
      await client.end();
      return new Response(
        JSON.stringify({ success: true, message: 'Table server_apps already exists' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the table
    await client.queryArray(`
      CREATE TABLE public.server_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL,
        server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        app_type TEXT NOT NULL DEFAULT 'own' CHECK (app_type IN ('own', 'partnership')),
        icon TEXT DEFAULT '📱',
        website_url TEXT,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Enable RLS
    await client.queryArray(`ALTER TABLE public.server_apps ENABLE ROW LEVEL SECURITY;`);

    // Create policies
    await client.queryArray(`
      CREATE POLICY "Sellers can view their own server apps"
        ON public.server_apps FOR SELECT
        USING (auth.uid() = seller_id);
    `);

    await client.queryArray(`
      CREATE POLICY "Sellers can insert their own server apps"
        ON public.server_apps FOR INSERT
        WITH CHECK (auth.uid() = seller_id);
    `);

    await client.queryArray(`
      CREATE POLICY "Sellers can update their own server apps"
        ON public.server_apps FOR UPDATE
        USING (auth.uid() = seller_id);
    `);

    await client.queryArray(`
      CREATE POLICY "Sellers can delete their own server apps"
        ON public.server_apps FOR DELETE
        USING (auth.uid() = seller_id);
    `);

    // Create trigger
    await client.queryArray(`
      CREATE TRIGGER update_server_apps_updated_at
        BEFORE UPDATE ON public.server_apps
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    `);

    // Create indexes
    await client.queryArray(`CREATE INDEX idx_server_apps_seller_id ON public.server_apps(seller_id);`);
    await client.queryArray(`CREATE INDEX idx_server_apps_server_id ON public.server_apps(server_id);`);

    await client.end();

    console.log('Table server_apps created successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Table server_apps created successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to create table', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
