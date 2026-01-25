-- =====================================================================
-- SECURITY FIX: Update RLS policies for exposed tables
-- Fixes remaining vulnerabilities
-- =====================================================================

-- =====================================================================
-- 1. FIX profiles TABLE - Drop existing and recreate properly
-- =====================================================================

-- Drop ALL existing SELECT policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public read access" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create restrictive SELECT policy - users can only see their own profile + admins can see all
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id 
  OR EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND (auth.users.raw_user_meta_data->>'role')::text = 'admin'
  )
);

-- =====================================================================
-- 2. FIX test_generation_log TABLE - Add RLS policies
-- =====================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.test_generation_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Sellers can view own test logs" ON public.test_generation_log;
DROP POLICY IF EXISTS "Sellers can insert own test logs" ON public.test_generation_log;
DROP POLICY IF EXISTS "Service role full access" ON public.test_generation_log;

-- Sellers can only view their own test logs
CREATE POLICY "Sellers can view own test logs"
ON public.test_generation_log
FOR SELECT
USING (auth.uid() = seller_id);

-- Sellers can insert their own test logs
CREATE POLICY "Sellers can insert own test logs"
ON public.test_generation_log
FOR INSERT
WITH CHECK (auth.uid() = seller_id);

-- =====================================================================
-- 3. FIX client_external_apps TABLE - Ensure RLS is strict
-- =====================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.client_external_apps ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate correctly
DROP POLICY IF EXISTS "Sellers can view own client apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can manage own client apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Users can view own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Users can insert own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Users can update own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Users can delete own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can view own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can insert own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can update own client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can delete own client external apps" ON public.client_external_apps;

-- Sellers can only view their own client external apps
CREATE POLICY "Sellers can view own client external apps"
ON public.client_external_apps
FOR SELECT
USING (auth.uid() = seller_id);

-- Sellers can insert their own client external apps
CREATE POLICY "Sellers can insert own client external apps"
ON public.client_external_apps
FOR INSERT
WITH CHECK (auth.uid() = seller_id);

-- Sellers can update their own client external apps
CREATE POLICY "Sellers can update own client external apps"
ON public.client_external_apps
FOR UPDATE
USING (auth.uid() = seller_id);

-- Sellers can delete their own client external apps
CREATE POLICY "Sellers can delete own client external apps"
ON public.client_external_apps
FOR DELETE
USING (auth.uid() = seller_id);