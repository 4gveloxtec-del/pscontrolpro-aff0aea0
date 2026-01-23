-- Adicionar política de DELETE para command_logs (caso não exista)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'command_logs' 
    AND policyname = 'Users can delete their own command logs'
  ) THEN
    CREATE POLICY "Users can delete their own command logs"
    ON public.command_logs
    FOR DELETE
    USING (auth.uid() = owner_id);
  END IF;
END
$$;