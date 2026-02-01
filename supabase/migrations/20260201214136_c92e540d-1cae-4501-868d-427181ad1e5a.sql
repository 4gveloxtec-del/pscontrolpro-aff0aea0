-- ETAPA 1: CORREÇÕES DE SEGURANÇA CRÍTICAS
-- =========================================

-- 1. FIX: login_attempts - Remover políticas permissivas e adicionar restritas
-- Essas políticas USING(true) permitem que QUALQUER usuário veja tentativas de login de TODOS

-- Remover políticas antigas
DROP POLICY IF EXISTS "Allow service to insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow service to read login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow service to delete login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow anon insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow anon read login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow anon delete login attempts" ON public.login_attempts;

-- Criar políticas mais restritivas
-- Edge Functions usam service_role, então não precisam de políticas específicas
-- Apenas admin pode VER logs de tentativas (para monitoramento)

CREATE POLICY "Admins can view all login attempts"
  ON public.login_attempts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- NOTA: INSERT/UPDATE/DELETE só via service_role (edge functions)
-- Não precisamos de políticas para isso pois service_role bypassa RLS

-- 2. FIX: Reforçar RLS na tabela profiles
-- Garantir que usuários só vejam seus próprios dados (exceto admins)

-- Remover política antiga que pode ser muito permissiva
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

-- Criar política clara: ver APENAS próprio perfil OU se admin
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid() OR 
    public.has_role(auth.uid(), 'admin')
  );

-- 3. Garantir que as tabelas sensíveis tenham RLS ativo
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_server_app_credentials ENABLE ROW LEVEL SECURITY;