-- Criar tabela para notificações broadcast do admin
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'urgent')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Criar tabela para rastrear quem leu cada notificação
CREATE TABLE public.admin_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES public.admin_notifications(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (notification_id, user_id)
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- Políticas para admin_notifications (todos podem ler, só admin pode criar)
CREATE POLICY "Anyone can view notifications"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can create notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete notifications"
ON public.admin_notifications
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Políticas para admin_notification_reads
CREATE POLICY "Users can view their own reads"
ON public.admin_notification_reads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark notifications as read"
ON public.admin_notification_reads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX idx_admin_notification_reads_user ON public.admin_notification_reads(user_id);
CREATE INDEX idx_admin_notification_reads_notification ON public.admin_notification_reads(notification_id);