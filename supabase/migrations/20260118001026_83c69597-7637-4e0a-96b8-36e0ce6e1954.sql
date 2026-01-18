-- Permitir que TODOS os usuários autenticados vejam a config global (apenas SELECT)
-- Isso é necessário para revendedores saberem se a API está ativa
DROP POLICY IF EXISTS "Only admins can view global config" ON public.whatsapp_global_config;

CREATE POLICY "Authenticated users can view global config" 
ON public.whatsapp_global_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Manter as outras policies apenas para admins
-- (INSERT, UPDATE, DELETE já estão corretas)