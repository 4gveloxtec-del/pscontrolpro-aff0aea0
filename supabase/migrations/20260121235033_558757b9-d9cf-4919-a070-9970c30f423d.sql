-- Add column to profiles table to store money visibility preference per seller
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hide_revenue boolean NOT NULL DEFAULT false;