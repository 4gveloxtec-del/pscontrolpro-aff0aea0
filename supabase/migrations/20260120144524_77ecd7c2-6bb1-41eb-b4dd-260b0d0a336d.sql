-- Create table to log messages sent to resellers via API
CREATE TABLE public.admin_reseller_message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  reseller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reseller_name TEXT,
  reseller_phone TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_used TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_reseller_message_logs ENABLE ROW LEVEL SECURITY;

-- Policies - only admins can access
CREATE POLICY "Admins can view all reseller message logs"
  ON public.admin_reseller_message_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert reseller message logs"
  ON public.admin_reseller_message_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update reseller message logs"
  ON public.admin_reseller_message_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Index for faster queries
CREATE INDEX idx_admin_reseller_message_logs_admin_id ON public.admin_reseller_message_logs(admin_id);
CREATE INDEX idx_admin_reseller_message_logs_reseller_id ON public.admin_reseller_message_logs(reseller_id);
CREATE INDEX idx_admin_reseller_message_logs_sent_at ON public.admin_reseller_message_logs(sent_at DESC);