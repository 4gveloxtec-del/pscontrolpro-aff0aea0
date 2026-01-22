import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Buscar perfil do SANDEL
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name')
      .ilike('full_name', '%sandel%')
      .limit(5);

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 
      });
    }

    if (!profiles || profiles.length === 0) {
      // Tentar por company_name
      const { data: profiles2 } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_name')
        .ilike('company_name', '%sandel%')
        .limit(5);
      
      if (!profiles2 || profiles2.length === 0) {
        return new Response(JSON.stringify({ 
          error: "SANDEL not found in profiles",
          searched: "full_name and company_name"
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 
        });
      }
      
      profiles.push(...profiles2);
    }

    const results: any[] = [];

    for (const profile of profiles) {
      // Buscar APIs configuradas
      const { data: apis } = await supabase
        .from('test_apis')
        .select('*')
        .eq('owner_id', profile.id);

      // Buscar comandos
      const { data: commands } = await supabase
        .from('whatsapp_commands')
        .select('*, test_apis(*)')
        .eq('owner_id', profile.id);

      // Buscar instância
      const { data: instance } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', profile.id)
        .maybeSingle();

      // Buscar últimos logs
      const { data: logs } = await supabase
        .from('command_logs')
        .select('*')
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      results.push({
        profile,
        apis: apis || [],
        commands: commands || [],
        instance,
        recent_logs: logs || [],
      });
    }

    // Se tiver API configurada, testar ela diretamente
    for (const r of results) {
      if (r.apis.length > 0) {
        for (const api of r.apis) {
          try {
            const fetchOptions: RequestInit = {
              method: api.api_method,
              headers: { 
                'Content-Type': 'application/json',
                ...(api.api_headers || {})
              },
            };

            if (api.api_method === 'POST' && api.api_body_template) {
              fetchOptions.body = JSON.stringify(api.api_body_template);
            }

            console.log(`Testing API: ${api.api_method} ${api.api_url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(api.api_url, {
              ...fetchOptions,
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            const responseText = await response.text();
            
            api._test_result = {
              status: response.status,
              ok: response.ok,
              body: responseText.substring(0, 1000),
            };
            
            // Tentar parsear JSON
            try {
              api._test_result.parsed = JSON.parse(responseText);
            } catch {
              api._test_result.parsed = null;
            }
          } catch (err: any) {
            api._test_result = {
              error: err.message,
              name: err.name,
            };
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: results,
      timestamp: new Date().toISOString()
    }, null, 2), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 
    });
  }
});
