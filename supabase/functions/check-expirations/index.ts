import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout constant for API calls
const API_TIMEOUT_MS = 15000;

// Fetch with timeout wrapper to prevent hanging requests
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ExpiringClient {
  id: string;
  name: string;
  expiration_date: string;
  seller_id: string;
  phone: string | null;
  plan_name: string | null;
}

interface Bill {
  id: string;
  description: string;
  recipient_name: string;
  amount: number;
  due_date: string;
  seller_id: string;
}

function formatExpirationMessage(client: ExpiringClient, today: Date): { title: string; body: string; urgency: string } {
  const expDate = new Date(client.expiration_date + 'T00:00:00');
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  
  const diffTime = expDate.getTime() - todayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const expDateFormatted = expDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const planInfo = client.plan_name ? ` • ${client.plan_name}` : '';
  
  let urgency: string;
  let emoji: string;
  let timeText: string;
  
  if (diffDays <= 0) {
    urgency = 'expired';
    emoji = '🔴';
    timeText = 'Venceu hoje!';
  } else if (diffDays === 1) {
    urgency = 'critical';
    emoji = '🟠';
    timeText = 'Vence amanhã!';
  } else if (diffDays === 2) {
    urgency = 'warning';
    emoji = '🟡';
    timeText = 'Vence em 2 dias';
  } else {
    urgency = 'info';
    emoji = '🔵';
    timeText = `Vence em ${diffDays} dias`;
  }
  
  return {
    title: `${emoji} ${client.name}`,
    body: `${timeText}${planInfo} • ${expDateFormatted}`,
    urgency
  };
}

function formatBillMessage(bill: Bill, today: Date): { title: string; body: string; urgency: string } {
  const dueDate = new Date(bill.due_date + 'T00:00:00');
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  
  const diffTime = dueDate.getTime() - todayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const dueDateFormatted = dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  
  let urgency: string;
  let emoji: string;
  let timeText: string;
  
  if (diffDays <= 0) {
    urgency = 'expired';
    emoji = '🔴';
    timeText = diffDays === 0 ? 'Vence HOJE!' : 'VENCIDA!';
  } else if (diffDays === 1) {
    urgency = 'critical';
    emoji = '🟠';
    timeText = 'Vence amanhã';
  } else if (diffDays === 2) {
    urgency = 'warning';
    emoji = '🟡';
    timeText = 'Vence em 2 dias';
  } else {
    urgency = 'info';
    emoji = '🔵';
    timeText = `Vence em ${diffDays} dias`;
  }
  
  return {
    title: `${emoji} Conta: ${bill.description}`,
    body: `${timeText} • R$ ${bill.amount.toFixed(2)} • ${bill.recipient_name} • ${dueDateFormatted}`,
    urgency
  };
}

interface ExpiringSeller {
  id: string;
  full_name: string | null;
  email: string;
  subscription_expires_at: string;
}

function formatSellerExpirationMessage(seller: ExpiringSeller, today: Date): { title: string; body: string; urgency: string } {
  const expDate = new Date(seller.subscription_expires_at);
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);
  
  const diffTime = expDate.getTime() - todayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const expDateFormatted = expDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  
  let urgency: string;
  let emoji: string;
  let timeText: string;
  
  if (diffDays <= 0) {
    urgency = 'expired';
    emoji = '🔴';
    timeText = 'Sua assinatura venceu HOJE!';
  } else if (diffDays === 1) {
    urgency = 'critical';
    emoji = '🔴';
    timeText = 'Sua assinatura vence AMANHÃ!';
  } else if (diffDays === 3) {
    urgency = 'warning';
    emoji = '🟠';
    timeText = 'Sua assinatura vence em 3 dias!';
  } else if (diffDays === 7) {
    urgency = 'info';
    emoji = '🟡';
    timeText = 'Sua assinatura vence em 7 dias';
  } else {
    urgency = 'info';
    emoji = '🔵';
    timeText = `Sua assinatura vence em ${diffDays} dias`;
  }
  
  return {
    title: `${emoji} Renovação Necessária`,
    body: `${timeText} • Vencimento: ${expDateFormatted}`,
    urgency
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[check-expirations] Starting expiration check...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all profiles with their notification preferences
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, notification_days_before');
    
    const notificationDaysMap: Record<string, number> = {};
    for (const profile of profilesData || []) {
      notificationDaysMap[profile.id] = profile.notification_days_before ?? 3;
    }
    
    // Get maximum notification days to fetch all potentially relevant data
    const maxDays = Math.max(...Object.values(notificationDaysMap), 3);

    // Get today and next X days dates (based on max configured days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxDaysFromNow = new Date(today);
    maxDaysFromNow.setDate(maxDaysFromNow.getDate() + maxDays);

    const todayStr = today.toISOString().split('T')[0];
    const maxDaysStr = maxDaysFromNow.toISOString().split('T')[0];

    console.log('[check-expirations] Checking from', todayStr, 'to', maxDaysStr);

    // ========== CHECK SELLER SUBSCRIPTIONS ==========
    console.log('[check-expirations] Checking seller subscriptions...');
    
    // Fixed notification days for seller subscriptions: 7, 3, and 1 day before expiration
    const SELLER_NOTIFICATION_DAYS = [7, 3, 1, 0]; // 0 = expiration day
    
    // Get sellers with expiring subscriptions (within 7 days)
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const { data: expiringSellers, error: sellersError } = await supabase
      .from('profiles')
      .select('id, full_name, email, subscription_expires_at')
      .not('subscription_expires_at', 'is', null)
      .eq('is_permanent', false)
      .gte('subscription_expires_at', today.toISOString())
      .lte('subscription_expires_at', sevenDaysFromNow.toISOString());

    if (sellersError) {
      console.error('[check-expirations] Error fetching expiring sellers:', sellersError);
    }

    console.log('[check-expirations] Found expiring sellers:', expiringSellers?.length || 0);

    let sellerNotificationsSent = 0;

    // Send notifications to expiring sellers ONLY on specific days: 7, 3, 1, and 0 (expiration day)
    if (expiringSellers && expiringSellers.length > 0) {
      for (const seller of expiringSellers) {
        // Calculate days until expiration
        const expDate = new Date(seller.subscription_expires_at);
        expDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Only send on specific days (7, 3, 1, 0)
        if (!SELLER_NOTIFICATION_DAYS.includes(diffDays)) {
          console.log(`[check-expirations] Skipping seller ${seller.email} - ${diffDays} days is not a notification day`);
          continue;
        }

        // Check if seller has push subscription
        const { data: sellerSub } = await supabase
          .from('push_subscriptions')
          .select('endpoint')
          .eq('user_id', seller.id)
          .limit(1);

        if (!sellerSub || sellerSub.length === 0) {
          console.log(`[check-expirations] Seller ${seller.email} has no push subscription`);
          continue;
        }

        console.log(`[check-expirations] Sending notification to ${seller.email} - ${diffDays} days until expiration`);

        const { title, body, urgency } = formatSellerExpirationMessage(seller, today);

        try {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              userId: seller.id,
              title,
              body,
              tag: `seller-subscription-${seller.id}`,
              data: { 
                type: 'seller-subscription-expiration', 
                sellerId: seller.id,
                expirationDate: seller.subscription_expires_at,
                urgency
              }
            }),
          });

          const result = await response.json();
          
          if (result.sent > 0) {
            sellerNotificationsSent++;
            console.log(`[check-expirations] ✓ Notified seller: ${seller.email} (${urgency})`);
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error(`[check-expirations] Timeout notifying seller ${seller.email}`);
          } else {
            console.error(`[check-expirations] Error notifying seller ${seller.email}:`, error);
          }
        }

        // Small delay between notifications
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // ========== CHECK CLIENT EXPIRATIONS ==========
    // Get all expiring clients
    const { data: expiringClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, expiration_date, seller_id, phone, plan_name')
      .gte('expiration_date', todayStr)
      .lte('expiration_date', maxDaysStr)
      .eq('is_archived', false)
      .order('expiration_date');

    if (clientsError) {
      throw new Error(`Error fetching clients: ${clientsError.message}`);
    }

    console.log('[check-expirations] Found expiring clients:', expiringClients?.length || 0);

    if (!expiringClients || expiringClients.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'Expiration check completed',
        sellerNotificationsSent,
        clientNotificationsSent: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group clients by seller
    const clientsBySeller: Record<string, ExpiringClient[]> = {};
    for (const client of expiringClients) {
      if (!clientsBySeller[client.seller_id]) {
        clientsBySeller[client.seller_id] = [];
      }
      clientsBySeller[client.seller_id].push(client);
    }

    console.log('[check-expirations] Sellers with expiring clients:', Object.keys(clientsBySeller).length);

    // Get push subscriptions for all sellers with expiring clients
    const sellerIds = Object.keys(clientsBySeller);
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint')
      .in('user_id', sellerIds);

    if (subError) {
      console.error('[check-expirations] Error fetching subscriptions:', subError);
    }

    console.log('[check-expirations] Found subscriptions:', subscriptions?.length || 0);

    let notificationsSent = 0;
    const results: { sellerId: string; clientsNotified: number; totalClients: number }[] = [];

    // Send individual notifications for each client (WhatsApp style)
    for (const [sellerId, clients] of Object.entries(clientsBySeller)) {
      const hasSubscription = subscriptions?.some(s => s.user_id === sellerId);
      
      if (!hasSubscription) {
        results.push({ sellerId, clientsNotified: 0, totalClients: clients.length });
        continue;
      }

      let clientsNotified = 0;
      const sellerDays = notificationDaysMap[sellerId] ?? 3;

      // Sort by urgency (expired first, then tomorrow, etc.)
      const sortedClients = clients.sort((a, b) => {
        const dateA = new Date(a.expiration_date);
        const dateB = new Date(b.expiration_date);
        return dateA.getTime() - dateB.getTime();
      });

      // Filter clients based on seller's notification preference
      const filteredClients = sortedClients.filter(client => {
        const expDate = new Date(client.expiration_date + 'T00:00:00');
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= sellerDays;
      });

      // Send individual notification for each client
      for (const client of filteredClients) {
        const { title, body, urgency } = formatExpirationMessage(client, today);
        
        try {
          // Add small delay between notifications to avoid rate limiting
          if (clientsNotified > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              userId: sellerId,
              title,
              body,
              tag: `client-${client.id}`, // Unique tag per client for individual notifications
              data: { 
                type: 'client-expiration', 
                clientId: client.id,
                clientName: client.name,
                expirationDate: client.expiration_date,
                urgency
              }
            }),
          });

          const result = await response.json();
          
          if (result.sent > 0) {
            clientsNotified++;
            notificationsSent++;
            console.log(`[check-expirations] ✓ Notified: ${client.name} (${urgency})`);
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error(`[check-expirations] Timeout notifying about ${client.name}`);
          } else {
            console.error(`[check-expirations] Error notifying about ${client.name}:`, error);
          }
        }
      }

      results.push({ sellerId, clientsNotified, totalClients: clients.length });
    }

    // ========== CHECK BILLS TO PAY ==========
    console.log('[check-expirations] Checking bills to pay...');

    const { data: pendingBills, error: billsError } = await supabase
      .from('bills_to_pay')
      .select('id, description, recipient_name, amount, due_date, seller_id')
      .eq('is_paid', false)
      .gte('due_date', todayStr)
      .lte('due_date', maxDaysStr)
      .order('due_date');

    if (billsError) {
      console.error('[check-expirations] Error fetching bills:', billsError);
    }

    console.log('[check-expirations] Found pending bills:', pendingBills?.length || 0);

    let billsNotificationsSent = 0;

    if (pendingBills && pendingBills.length > 0) {
      // Group bills by seller
      const billsBySeller: Record<string, Bill[]> = {};
      for (const bill of pendingBills) {
        if (!billsBySeller[bill.seller_id]) {
          billsBySeller[bill.seller_id] = [];
        }
        billsBySeller[bill.seller_id].push(bill);
      }

      // Get push subscriptions for sellers with pending bills
      const billSellerIds = Object.keys(billsBySeller);
      const { data: billSubscriptions } = await supabase
        .from('push_subscriptions')
        .select('user_id, endpoint')
        .in('user_id', billSellerIds);

      // Send notifications for each bill
      for (const [sellerId, bills] of Object.entries(billsBySeller)) {
        const hasSubscription = billSubscriptions?.some(s => s.user_id === sellerId);
        
        if (!hasSubscription) continue;

        const sellerDays = notificationDaysMap[sellerId] ?? 3;

        // Sort by due date and filter based on seller's preference
        const sortedBills = bills
          .sort((a, b) => {
            const dateA = new Date(a.due_date);
            const dateB = new Date(b.due_date);
            return dateA.getTime() - dateB.getTime();
          })
          .filter(bill => {
            const dueDate = new Date(bill.due_date + 'T00:00:00');
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= sellerDays;
          });

        for (const bill of sortedBills) {
          const { title, body, urgency } = formatBillMessage(bill, today);
          
          try {
            if (billsNotificationsSent > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-push-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                userId: sellerId,
                title,
                body,
                tag: `bill-${bill.id}`,
                data: { 
                  type: 'bill-reminder', 
                  billId: bill.id,
                  billDescription: bill.description,
                  dueDate: bill.due_date,
                  amount: bill.amount,
                  urgency
                }
              }),
            });

            const result = await response.json();
            
            if (result.sent > 0) {
              billsNotificationsSent++;
              console.log(`[check-expirations] ✓ Bill notified: ${bill.description} (${urgency})`);
            }
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.error(`[check-expirations] Timeout notifying about bill ${bill.description}`);
            } else {
              console.error(`[check-expirations] Error notifying about bill ${bill.description}:`, error);
            }
          }
        }
      }
    }

    console.log('[check-expirations] Completed. Client notifications:', notificationsSent, 'Seller notifications:', sellerNotificationsSent, 'Bills notifications:', billsNotificationsSent);

    return new Response(JSON.stringify({ 
      message: 'Expiration check completed',
      totalExpiringClients: expiringClients.length,
      totalExpiringSellers: expiringSellers?.length || 0,
      totalPendingBills: pendingBills?.length || 0,
      sellersChecked: sellerIds.length,
      clientNotificationsSent: notificationsSent,
      sellerNotificationsSent,
      billsNotificationsSent,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[check-expirations] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
