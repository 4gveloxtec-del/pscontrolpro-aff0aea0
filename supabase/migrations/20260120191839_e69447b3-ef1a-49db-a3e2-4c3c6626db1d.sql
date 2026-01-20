-- Add adult content flag to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS has_adult_content boolean DEFAULT false;

-- Add comment to explain the field
COMMENT ON COLUMN public.clients.has_adult_content IS 'Indica se o cliente tem acesso a conteúdo adulto (+18)';