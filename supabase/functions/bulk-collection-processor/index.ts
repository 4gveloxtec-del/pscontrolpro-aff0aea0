import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_TIMEOUT_MS = 15000;

async function ensureClientNotificationTracking(
  supabase: any,
  params: {
    seller_id: string;
    client_id: string;
    notification_type: string;
    expiration_cycle_date: string;
    sent_via: string;
  }
): Promise<boolean> {
  const { seller_id, client_id, notification_type, expiration_cycle_date, sent_via } = params;
  if (!seller_id || !client_id || !notification_type || !expiration_cycle_date) return false;

  const { data: existing, error: existsError } = await supabase
    .from('client_notification_tracking')
    .select('id')
    .eq('seller_id', seller_id)
    .eq('client_id', client_id)
    .eq('notification_type', notification_type)
    .eq('expiration_cycle_date', expiration_cycle_date)
    .maybeSingle();

  if (existsError) return false;
  if (existing?.id) return true; // already tracked

  const { error: insertError } = await supabase.from('client_notification_tracking').insert({
    seller_id,
    client_id,
    notification_type,
    expiration_cycle_date,
    sent_via,
  });

  return !insertError;
}

interface BulkJob {
  id: string;
  seller_id: string;
  status: 'pending' | 'processing' | 'completed' | 'paused' | 'cancelled';
  total_clients: number;
  processed_clients: number;
  success_count: number;
  error_count: number;
  interval_seconds: number;
  clients_data: any[];
  current_index: number;
  created_at: string;
  updated_at: string;
  last_error?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendEvolutionMessage(
  apiUrl: string,
  apiToken: string,
  instanceName: string,
  phone: string,
  message: string,
  retries = 2
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let normalizedUrl = apiUrl.trim();
      if (normalizedUrl.endsWith('/')) {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }

      const endpoint = `${normalizedUrl}/message/sendText/${instanceName}`;
      console.log(`[bulk] Attempt ${attempt + 1}: Sending to ${phone}`);

      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken,
        },
        body: JSON.stringify({
          number: phone,
          text: message,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { success: false, error: `HTTP ${response.status}: ${responseText}` };
      }

      const data = JSON.parse(responseText);
      if (data.key || data.status === 'PENDING' || data.messageId) {
        return { success: true };
      }

      return { success: false, error: data.message || 'Unknown error' };
    } catch (error: any) {
      console.error('[bulk] Send error:', error.message);
      // Retry on timeout/network errors
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { success: false, error: error.message || 'Network error' };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, seller_id, job_id, clients, interval_seconds, profile_data } = await req.json();

    // ACTION: Start a new bulk job
    if (action === 'start') {
      if (!seller_id || !clients || clients.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Check for existing active job
      const { data: existingJob } = await supabase
        .from('bulk_collection_jobs')
        .select('*')
        .eq('seller_id', seller_id)
        .in('status', ['pending', 'processing', 'paused'])
        .maybeSingle();

      if (existingJob) {
        return new Response(JSON.stringify({ 
          error: 'Já existe um job em andamento',
          existing_job: existingJob 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Create new job
      const { data: newJob, error: createError } = await supabase
        .from('bulk_collection_jobs')
        .insert({
          seller_id,
          status: 'pending',
          total_clients: clients.length,
          processed_clients: 0,
          success_count: 0,
          error_count: 0,
          interval_seconds: interval_seconds || 15,
          clients_data: clients,
          profile_data: profile_data,
          current_index: 0,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Start processing in background (fire and forget)
      processJob(supabase, newJob.id).catch(console.error);

      return new Response(JSON.stringify({ 
        success: true, 
        job_id: newJob.id,
        message: 'Job iniciado em segundo plano'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Get job status
    if (action === 'status') {
      const { data: job, error } = await supabase
        .from('bulk_collection_jobs')
        .select('*')
        .eq('id', job_id)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ job }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Get active job for seller
    if (action === 'get_active') {
      const { data: job } = await supabase
        .from('bulk_collection_jobs')
        .select('*')
        .eq('seller_id', seller_id)
        .in('status', ['pending', 'processing', 'paused'])
        .order('created_at', { ascending: false })
        .maybeSingle();

      return new Response(JSON.stringify({ job }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Pause job
    if (action === 'pause') {
      const { error } = await supabase
        .from('bulk_collection_jobs')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', job_id)
        .eq('seller_id', seller_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Resume job
    if (action === 'resume') {
      const { data: job, error: fetchError } = await supabase
        .from('bulk_collection_jobs')
        .select('*')
        .eq('id', job_id)
        .eq('seller_id', seller_id)
        .single();

      if (fetchError) throw fetchError;

      if (job.status !== 'paused') {
        return new Response(JSON.stringify({ error: 'Job não está pausado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      await supabase
        .from('bulk_collection_jobs')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', job_id);

      // Resume processing in background (fire and forget)
      processJob(supabase, job_id).catch(console.error);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Cancel job
    if (action === 'cancel') {
      const { error } = await supabase
        .from('bulk_collection_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', job_id)
        .eq('seller_id', seller_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION: Get recent jobs
    if (action === 'list') {
      const { data: jobs, error } = await supabase
        .from('bulk_collection_jobs')
        .select('id, status, total_clients, processed_clients, success_count, error_count, created_at, updated_at')
        .eq('seller_id', seller_id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return new Response(JSON.stringify({ jobs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function processJob(supabase: any, jobId: string) {
  console.log(`Starting to process job ${jobId}`);

  try {
    // Fetch job data
    const { data: job, error: fetchError } = await supabase
      .from('bulk_collection_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      console.error('Failed to fetch job:', fetchError);
      return;
    }

    // Update status to processing
    await supabase
      .from('bulk_collection_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    // Get WhatsApp config
    const { data: sellerInstance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', job.seller_id)
      .maybeSingle();

    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .maybeSingle();

    if (!sellerInstance?.is_connected || !globalConfig?.api_url || !globalConfig?.api_token) {
      await supabase
        .from('bulk_collection_jobs')
        .update({ 
          status: 'cancelled', 
          last_error: 'WhatsApp API não configurada ou desconectada',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      return;
    }

    // Get templates
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('seller_id', job.seller_id);

    const clients = job.clients_data || [];
    const profileData = job.profile_data || {};
    let currentIndex = job.current_index || 0;
    let successCount = job.success_count || 0;
    let errorCount = job.error_count || 0;

    // Process each client
    for (let i = currentIndex; i < clients.length; i++) {
      // Check if job was paused/cancelled
      const { data: currentJob } = await supabase
        .from('bulk_collection_jobs')
        .select('status')
        .eq('id', jobId)
        .single();

      if (currentJob?.status === 'paused' || currentJob?.status === 'cancelled') {
        console.log(`Job ${jobId} was ${currentJob.status}`);
        return;
      }

      const client = clients[i];
      
      // Find appropriate template
      const categoryLower = (client.category || 'iptv').toLowerCase();
      const daysLeft = client.daysRemaining ?? daysUntil(client.expiration_date);
      
      let templateType = 'expired';
      if (daysLeft > 0 && daysLeft <= 3) templateType = 'expiring_3days';
      if (daysLeft > 3) templateType = 'billing';

      const template = templates?.find((t: any) => t.type === templateType && t.name.toLowerCase().includes(categoryLower))
        || templates?.find((t: any) => t.type === templateType);

      if (!template) {
        errorCount++;
        await updateJobProgress(supabase, jobId, i + 1, successCount, errorCount);
        continue;
      }

      // Replace variables
      const message = template.message
        .replace(/\{nome\}/g, client.name || '')
        .replace(/\{empresa\}/g, profileData.company_name || profileData.full_name || '')
        .replace(/\{vencimento\}/g, formatDate(client.expiration_date))
        .replace(/\{dias_restantes\}/g, String(daysLeft))
        .replace(/\{valor\}/g, String(client.plan_price || 0))
        .replace(/\{plano\}/g, client.plan_name || '')
        .replace(/\{pix\}/g, profileData.pix_key || '')
        .replace(/\{servico\}/g, client.category || 'IPTV');

      // Format phone
      let phone = (client.phone || '').replace(/\D/g, '');
      if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
        phone = '55' + phone;
      }

      // Send message
      const notificationType = daysLeft <= 0 ? 'iptv_vencimento' : daysLeft <= 3 ? 'iptv_3_dias' : 'iptv_cobranca';

      // Etapa 5 (DB guard): idempotency. If already tracked for this cycle, skip sending.
      const { data: alreadyTracked } = await supabase
        .from('client_notification_tracking')
        .select('id')
        .eq('seller_id', job.seller_id)
        .eq('client_id', client.id)
        .eq('notification_type', notificationType)
        .eq('expiration_cycle_date', client.expiration_date)
        .maybeSingle();

      if (alreadyTracked?.id) {
        successCount++;
        await updateJobProgress(supabase, jobId, i + 1, successCount, errorCount);
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, job.interval_seconds * 1000));
        }
        continue;
      }

      const result = await sendEvolutionMessage(
        globalConfig.api_url,
        globalConfig.api_token,
        sellerInstance.instance_name,
        phone,
        message
      );

      if (result.success) {
        successCount++;

        // Track notification (idempotent)
        await ensureClientNotificationTracking(supabase, {
          client_id: client.id,
          seller_id: job.seller_id,
          notification_type: notificationType,
          expiration_cycle_date: client.expiration_date,
          sent_via: 'api_bulk_background',
        });
      } else {
        errorCount++;
        console.log('Failed to send message, error:', result.error);
      }

      // Update progress
      await updateJobProgress(supabase, jobId, i + 1, successCount, errorCount);

      // Wait for interval before next message (unless last one)
      if (i < clients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, job.interval_seconds * 1000));
      }
    }

    // Mark as completed
    await supabase
      .from('bulk_collection_jobs')
      .update({ 
        status: 'completed',
        processed_clients: clients.length,
        success_count: successCount,
        error_count: errorCount,
        current_index: clients.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);

  } catch (error: any) {
    console.error(`Error processing job ${jobId}:`, error);
    await supabase
      .from('bulk_collection_jobs')
      .update({ 
        status: 'cancelled',
        last_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

async function updateJobProgress(supabase: any, jobId: string, processed: number, success: number, errors: number) {
  await supabase
    .from('bulk_collection_jobs')
    .update({
      processed_clients: processed,
      success_count: success,
      error_count: errors,
      current_index: processed,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
}
