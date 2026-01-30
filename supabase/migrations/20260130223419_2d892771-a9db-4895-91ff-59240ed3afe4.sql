-- ==========================
-- BILLING MODE SYSTEM
-- ==========================

-- Add billing_mode column to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS billing_mode text DEFAULT 'manual' 
CHECK (billing_mode IN ('manual', 'automatic'));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_clients_billing_mode ON public.clients(billing_mode);

-- ==========================
-- BILLING REMINDER TEMPLATES
-- ==========================

-- Create table for billing reminder templates (separate from whatsapp_templates)
CREATE TABLE IF NOT EXISTS public.billing_reminder_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  name text NOT NULL,
  message text NOT NULL,
  is_global boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_reminder_templates ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own templates + global templates
CREATE POLICY "Sellers can view own and global templates"
ON public.billing_reminder_templates
FOR SELECT
USING (
  seller_id = auth.uid() 
  OR is_global = true
);

-- Sellers can insert their own templates (non-global)
CREATE POLICY "Sellers can create own templates"
ON public.billing_reminder_templates
FOR INSERT
WITH CHECK (
  seller_id = auth.uid() 
  AND is_global = false
);

-- Sellers can update only their own non-global templates
CREATE POLICY "Sellers can update own templates"
ON public.billing_reminder_templates
FOR UPDATE
USING (
  seller_id = auth.uid() 
  AND is_global = false
);

-- Sellers can delete only their own non-global templates
CREATE POLICY "Sellers can delete own templates"
ON public.billing_reminder_templates
FOR DELETE
USING (
  seller_id = auth.uid() 
  AND is_global = false
);

-- Admins can manage global templates
CREATE POLICY "Admins can manage global templates"
ON public.billing_reminder_templates
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ==========================
-- BILLING REMINDERS
-- ==========================

CREATE TABLE IF NOT EXISTS public.billing_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.billing_reminder_templates(id) ON DELETE SET NULL,
  message text NOT NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_reminders ENABLE ROW LEVEL SECURITY;

-- Sellers can view only their own reminders
CREATE POLICY "Sellers can view own reminders"
ON public.billing_reminders
FOR SELECT
USING (seller_id = auth.uid());

-- Sellers can create reminders for their own clients
CREATE POLICY "Sellers can create own reminders"
ON public.billing_reminders
FOR INSERT
WITH CHECK (seller_id = auth.uid());

-- Sellers can update their own reminders (only if scheduled)
CREATE POLICY "Sellers can update own scheduled reminders"
ON public.billing_reminders
FOR UPDATE
USING (seller_id = auth.uid() AND status = 'scheduled');

-- Sellers can delete their own reminders
CREATE POLICY "Sellers can delete own reminders"
ON public.billing_reminders
FOR DELETE
USING (seller_id = auth.uid());

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_billing_reminders_seller ON public.billing_reminders(seller_id);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_status ON public.billing_reminders(status);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_scheduled ON public.billing_reminders(scheduled_date, scheduled_time) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_billing_reminders_client ON public.billing_reminders(client_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_billing_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_billing_reminders_updated_at ON public.billing_reminders;
CREATE TRIGGER trigger_billing_reminders_updated_at
BEFORE UPDATE ON public.billing_reminders
FOR EACH ROW
EXECUTE FUNCTION update_billing_reminders_updated_at();

-- Trigger for updated_at on templates
CREATE OR REPLACE FUNCTION update_billing_reminder_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_billing_reminder_templates_updated_at ON public.billing_reminder_templates;
CREATE TRIGGER trigger_billing_reminder_templates_updated_at
BEFORE UPDATE ON public.billing_reminder_templates
FOR EACH ROW
EXECUTE FUNCTION update_billing_reminder_templates_updated_at();

-- ==========================
-- FUNCTION TO CANCEL REMINDERS WHEN SWITCHING TO MANUAL
-- ==========================

CREATE OR REPLACE FUNCTION cancel_client_pending_reminders(p_client_id uuid)
RETURNS integer AS $$
DECLARE
  cancelled_count integer;
BEGIN
  UPDATE public.billing_reminders
  SET status = 'cancelled', updated_at = now()
  WHERE client_id = p_client_id AND status = 'scheduled';
  
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION cancel_client_pending_reminders(uuid) TO authenticated;