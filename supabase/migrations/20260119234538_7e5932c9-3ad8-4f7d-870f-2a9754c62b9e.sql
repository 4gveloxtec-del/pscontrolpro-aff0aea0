-- Create message queue table for intelligent message sending
CREATE TABLE public.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'expiration',
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create admin broadcast table for tracking broadcasts to resellers
CREATE TABLE public.admin_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  interval_seconds INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create broadcast recipients tracking
CREATE TABLE public.admin_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create seller queue settings table
CREATE TABLE public.seller_queue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  interval_seconds INTEGER DEFAULT 30,
  start_hour INTEGER DEFAULT 8,
  end_hour INTEGER DEFAULT 22,
  catch_up_mode BOOLEAN DEFAULT false,
  catch_up_completed BOOLEAN DEFAULT false,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_queue_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_queue
CREATE POLICY "Sellers can view their own message queue"
ON public.message_queue FOR SELECT
USING (seller_id = auth.uid());

CREATE POLICY "Sellers can manage their own message queue"
ON public.message_queue FOR ALL
USING (seller_id = auth.uid());

-- RLS policies for admin_broadcasts (admin only)
CREATE POLICY "Admins can manage broadcasts"
ON public.admin_broadcasts FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view broadcasts"
ON public.admin_broadcasts FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for admin_broadcast_recipients
CREATE POLICY "Admins can manage broadcast recipients"
ON public.admin_broadcast_recipients FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for seller_queue_settings
CREATE POLICY "Sellers can view their own queue settings"
ON public.seller_queue_settings FOR SELECT
USING (seller_id = auth.uid());

CREATE POLICY "Sellers can manage their own queue settings"
ON public.seller_queue_settings FOR ALL
USING (seller_id = auth.uid());

-- Admins can view all queue settings
CREATE POLICY "Admins can view all queue settings"
ON public.seller_queue_settings FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for efficient queue processing
CREATE INDEX idx_message_queue_status ON public.message_queue(seller_id, status, priority DESC);
CREATE INDEX idx_message_queue_scheduled ON public.message_queue(scheduled_at);
CREATE INDEX idx_broadcast_recipients_status ON public.admin_broadcast_recipients(broadcast_id, status);