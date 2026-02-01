-- 1. Fix admin account: sandelrodrig@gmail.com
-- Ensure role is 'admin' and profile is marked as permanent
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'sandelrodrig@gmail.com');

-- If no role exists, insert it
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE email = 'sandelrodrig@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Mark admin profile as permanent (never expires)
UPDATE public.profiles 
SET 
  is_permanent = true,
  subscription_expires_at = NULL,
  is_active = true
WHERE email = 'sandelrodrig@gmail.com';

-- 2. Fix reseller SANDEL (separate account) - mark as permanent if needed
-- First, identify the account by name (not the admin email)
UPDATE public.profiles 
SET 
  is_permanent = true,
  subscription_expires_at = NULL,
  is_active = true
WHERE 
  (UPPER(full_name) = 'SANDEL' OR UPPER(full_name) LIKE '%SANDEL%')
  AND email != 'sandelrodrig@gmail.com';

-- Ensure the reseller has the 'seller' role (not admin)
UPDATE public.user_roles
SET role = 'seller'
WHERE user_id IN (
  SELECT id FROM public.profiles 
  WHERE (UPPER(full_name) = 'SANDEL' OR UPPER(full_name) LIKE '%SANDEL%')
  AND email != 'sandelrodrig@gmail.com'
);

-- Insert seller role if not exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'seller' 
FROM public.profiles 
WHERE (UPPER(full_name) = 'SANDEL' OR UPPER(full_name) LIKE '%SANDEL%')
AND email != 'sandelrodrig@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;