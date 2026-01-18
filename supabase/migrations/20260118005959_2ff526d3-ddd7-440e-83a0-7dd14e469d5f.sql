-- =====================================================
-- AUDITORIA DE SEGURANÇA COMPLETA - CORREÇÕES
-- =====================================================

-- 1. CORRIGIR login_attempts - Remover acesso público e restringir a admins/serviço
DROP POLICY IF EXISTS "Allow service to read login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow service to insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Allow service to delete login attempts" ON public.login_attempts;

-- Criar políticas mais restritivas para login_attempts
-- Apenas permite operações via service_role (edge functions)
CREATE POLICY "Service role can manage login attempts"
ON public.login_attempts
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Admins podem visualizar para auditoria
CREATE POLICY "Admins can view login attempts"
ON public.login_attempts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. CORRIGIR whatsapp_global_config - Ocultar tokens sensíveis
-- Criar view segura que não expõe o token
DROP VIEW IF EXISTS public.whatsapp_global_config_public;
CREATE VIEW public.whatsapp_global_config_public
WITH (security_invoker = on) AS
SELECT 
    id,
    api_url,
    is_active,
    created_at,
    updated_at,
    CASE 
        WHEN api_token IS NOT NULL AND api_token != '' THEN '***configured***'
        ELSE ''
    END as api_token_status
FROM public.whatsapp_global_config;

-- 3. CORRIGIR shared_panels - Ocultar senhas
DROP VIEW IF EXISTS public.shared_panels_safe;
CREATE VIEW public.shared_panels_safe
WITH (security_invoker = on) AS
SELECT 
    id,
    seller_id,
    name,
    panel_type,
    url,
    login,
    CASE 
        WHEN password IS NOT NULL AND password != '' THEN '***hidden***'
        ELSE NULL
    END as password_status,
    total_slots,
    used_slots,
    used_iptv_slots,
    used_p2p_slots,
    iptv_per_credit,
    p2p_per_credit,
    monthly_cost,
    is_active,
    expires_at,
    notes,
    created_at,
    updated_at
FROM public.shared_panels;

-- 4. Garantir que profiles não pode ser deletado por usuários comuns
DROP POLICY IF EXISTS "Users cannot delete profiles" ON public.profiles;

-- Apenas admins podem deletar profiles
CREATE POLICY "Only admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Adicionar política de INSERT para profiles (necessário para criação de conta)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service can insert profiles" ON public.profiles;

CREATE POLICY "Service role can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR auth.uid() = id);

-- 6. Adicionar audit log para ações sensíveis
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    action text NOT NULL,
    table_name text,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver logs de auditoria
CREATE POLICY "Only admins can view audit logs"
ON public.security_audit_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role pode inserir logs
CREATE POLICY "Service can insert audit logs"
ON public.security_audit_log
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- 7. Criar índices para performance de consultas de segurança
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time 
ON public.login_attempts(email, attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_user_time 
ON public.security_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_action 
ON public.security_audit_log(action, created_at DESC);