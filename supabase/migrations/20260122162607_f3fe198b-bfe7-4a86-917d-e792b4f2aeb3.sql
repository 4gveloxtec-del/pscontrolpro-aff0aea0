-- Corrigir RLS da tabela shared_servers para ser mais segura
-- Remover política permissiva e criar política adequada

-- Primeiro dropar a política existente se houver
DROP POLICY IF EXISTS "Authenticated users can insert shared servers" ON public.shared_servers;

-- Criar política que exige autenticação real (não apenas 'true')
CREATE POLICY "Authenticated users can insert shared servers" 
ON public.shared_servers 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);