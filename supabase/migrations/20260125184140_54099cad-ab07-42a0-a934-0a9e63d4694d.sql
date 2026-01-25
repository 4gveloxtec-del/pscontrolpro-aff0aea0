-- Garantir que a política existe (usando DO block para evitar erro se já existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'test_generation_log' 
    AND policyname = 'Sellers can delete own test logs'
  ) THEN
    EXECUTE 'CREATE POLICY "Sellers can delete own test logs"
    ON public.test_generation_log
    FOR DELETE
    USING (auth.uid() = seller_id)';
  END IF;
END $$;