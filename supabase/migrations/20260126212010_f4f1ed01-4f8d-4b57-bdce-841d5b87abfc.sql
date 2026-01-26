-- =======================================================================
-- CORRIGIR RLS PROFILES: Remover referência a auth.users
-- A coluna role é do tipo app_role (enum), precisa de cast explícito
-- =======================================================================

-- 1. Dropar função antiga se existir
DROP FUNCTION IF EXISTS public.has_role(uuid, text);

-- 2. Criar função has_role com cast correto para app_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role::app_role
  );
$$;

-- 3. Remover políticas problemáticas da tabela profiles
DROP POLICY IF EXISTS "Profiles are viewable by owner or admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;

-- 4. Criar novas políticas SEM referência a auth.users
-- Usuários podem ver seu próprio perfil
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Admins podem ver todos os perfis (usando public.user_roles, não auth.users)
CREATE POLICY "Admin can view all profiles"
ON public.profiles FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
);

-- Usuários podem atualizar seu próprio perfil
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Admins podem atualizar todos os perfis
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles"
ON public.profiles FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
);

-- Admins podem inserir perfis (para criar novos vendedores)
DROP POLICY IF EXISTS "Admin can insert profiles" ON public.profiles;
CREATE POLICY "Admin can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR auth.uid() = id
);

-- 5. Corrigir políticas da tabela user_roles
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admin can view all roles" ON public.user_roles;

-- Usuários podem ver suas próprias roles
CREATE POLICY "Users can view their own role"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- Admins podem ver todas as roles
CREATE POLICY "Admin can view all roles"
ON public.user_roles FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
);