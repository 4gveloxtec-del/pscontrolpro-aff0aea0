-- Add column to track preference for push notifications about unnotified clients
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS push_unnotified_clients boolean DEFAULT true;