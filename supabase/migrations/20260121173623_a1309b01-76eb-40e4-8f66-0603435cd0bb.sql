-- Create storage bucket for landing page images
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-images', 'landing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to landing images
CREATE POLICY "Public can view landing images"
ON storage.objects FOR SELECT
USING (bucket_id = 'landing-images');

-- Only admins can manage landing images
CREATE POLICY "Admins can manage landing images"
ON storage.objects FOR ALL
USING (
  bucket_id = 'landing-images' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create table to store landing page platform configs
CREATE TABLE IF NOT EXISTS public.landing_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon_url TEXT,
  color TEXT DEFAULT '#6366f1',
  bg_color TEXT DEFAULT '#6366f1/10',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.landing_platforms ENABLE ROW LEVEL SECURITY;

-- Anyone can read platforms
CREATE POLICY "Anyone can read landing platforms"
ON public.landing_platforms FOR SELECT
USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage landing platforms"
ON public.landing_platforms FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Insert default platforms
INSERT INTO public.landing_platforms (name, display_name, color, bg_color, sort_order) VALUES
  ('netflix', 'Netflix', '#E50914', 'rgba(229, 9, 20, 0.1)', 1),
  ('spotify', 'Spotify', '#1DB954', 'rgba(29, 185, 84, 0.1)', 2),
  ('disney', 'Disney+', '#0063E5', 'rgba(0, 99, 229, 0.1)', 3),
  ('hbo', 'HBO Max', '#B535F6', 'rgba(181, 53, 246, 0.1)', 4),
  ('prime', 'Prime', '#00A8E1', 'rgba(0, 168, 225, 0.1)', 5),
  ('iptv', 'IPTV', '#FF6B35', 'rgba(255, 107, 53, 0.1)', 6)
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_landing_platforms_updated_at
  BEFORE UPDATE ON public.landing_platforms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();