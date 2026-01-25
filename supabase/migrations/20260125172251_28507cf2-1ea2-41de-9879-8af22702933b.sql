-- Add archived clients reengagement settings to seller_queue_settings
ALTER TABLE public.seller_queue_settings
ADD COLUMN IF NOT EXISTS archived_reengagement_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_reengagement_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS archived_reengagement_template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS archived_reengagement_last_run TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN public.seller_queue_settings.archived_reengagement_enabled IS 'Enable sending reengagement messages to archived clients';
COMMENT ON COLUMN public.seller_queue_settings.archived_reengagement_days IS 'Days after archiving to send reengagement message';
COMMENT ON COLUMN public.seller_queue_settings.archived_reengagement_template_id IS 'Template to use for reengagement messages';
COMMENT ON COLUMN public.seller_queue_settings.archived_reengagement_last_run IS 'Last time reengagement was processed';