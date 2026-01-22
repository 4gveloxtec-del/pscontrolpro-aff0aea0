-- =====================================================
-- SECURITY HARDENING: Restrict access to sensitive tables
-- This migration updates RLS policies to be more restrictive
-- while maintaining all existing functionality
-- =====================================================

-- 1. PROFILES TABLE - Restrict to own profile only (users can see only their own data)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
TO authenticated
USING (id = auth.uid());

-- Allow admins to view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. CLIENTS TABLE - Restrict to seller_id only
DROP POLICY IF EXISTS "Sellers can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Sellers can view own clients" ON public.clients;
CREATE POLICY "Sellers can view own clients" 
ON public.clients FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- Allow admins to view all clients
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
CREATE POLICY "Admins can view all clients" 
ON public.clients FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. SHARED_PANELS TABLE - Restrict to owner only (contains credentials)
DROP POLICY IF EXISTS "Users can view all shared panels" ON public.shared_panels;
DROP POLICY IF EXISTS "Sellers can view own shared panels" ON public.shared_panels;
CREATE POLICY "Sellers can view own shared panels" 
ON public.shared_panels FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- Allow admins to view all panels
DROP POLICY IF EXISTS "Admins can view all shared panels" ON public.shared_panels;
CREATE POLICY "Admins can view all shared panels" 
ON public.shared_panels FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. CLIENT_EXTERNAL_APPS TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all client external apps" ON public.client_external_apps;
DROP POLICY IF EXISTS "Sellers can view own client external apps" ON public.client_external_apps;
CREATE POLICY "Sellers can view own client external apps" 
ON public.client_external_apps FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- 5. CLIENT_PREMIUM_ACCOUNTS TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all client premium accounts" ON public.client_premium_accounts;
DROP POLICY IF EXISTS "Sellers can view own client premium accounts" ON public.client_premium_accounts;
CREATE POLICY "Sellers can view own client premium accounts" 
ON public.client_premium_accounts FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- 6. BILLS_TO_PAY TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all bills" ON public.bills_to_pay;
DROP POLICY IF EXISTS "Sellers can view own bills" ON public.bills_to_pay;
CREATE POLICY "Sellers can view own bills" 
ON public.bills_to_pay FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- 7. MESSAGE_HISTORY TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all message history" ON public.message_history;
DROP POLICY IF EXISTS "Sellers can view own message history" ON public.message_history;
CREATE POLICY "Sellers can view own message history" 
ON public.message_history FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- 8. SERVERS TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all servers" ON public.servers;
DROP POLICY IF EXISTS "Sellers can view own servers" ON public.servers;
CREATE POLICY "Sellers can view own servers" 
ON public.servers FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());

-- 9. WHATSAPP_TEMPLATES TABLE - Restrict to owner
DROP POLICY IF EXISTS "Sellers can view all templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can view own templates" ON public.whatsapp_templates;
CREATE POLICY "Sellers can view own templates" 
ON public.whatsapp_templates FOR SELECT 
TO authenticated
USING (seller_id = auth.uid());