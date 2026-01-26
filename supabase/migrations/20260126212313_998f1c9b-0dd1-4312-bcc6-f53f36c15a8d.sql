-- =======================================================================
-- FIX: remover dependências da função has_role(uuid,text) e policy antiga
-- que referencia auth.users ("Users can view own profile").
-- =======================================================================

-- 0) Dropar policies que dependem de has_role(uuid,text)
-- (criadas em migração anterior)
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can insert profiles" ON public.profiles;

DROP POLICY IF EXISTS "Admin can view all roles" ON public.user_roles;

-- 1) Dropar policies SELECT antigas na profiles (inclui a problemática com auth.users)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by owner or admin" ON public.profiles;

-- 2) Agora podemos remover o overload uuid,text
DROP FUNCTION IF EXISTS public.has_role(uuid, text);

-- 3) Garantir função canônica has_role(uuid, app_role)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- 4) Recriar policies corretas (sem auth.users)
-- PROFILES: SELECT
CREATE POLICY "Profiles are viewable by owner or admin"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- PROFILES: UPDATE (idempotente)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- USER_ROLES: SELECT
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
