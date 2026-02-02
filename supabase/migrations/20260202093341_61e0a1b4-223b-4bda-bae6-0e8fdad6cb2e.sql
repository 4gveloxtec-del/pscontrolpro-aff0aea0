-- Add unique constraint for push_subscriptions upsert to work correctly
-- This prevents duplicate subscriptions and allows the upsert to work

-- First check if constraint already exists and add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'push_subscriptions_user_endpoint_unique'
  ) THEN
    ALTER TABLE public.push_subscriptions 
    ADD CONSTRAINT push_subscriptions_user_endpoint_unique 
    UNIQUE (user_id, endpoint);
    
    RAISE NOTICE 'Added unique constraint push_subscriptions_user_endpoint_unique';
  ELSE
    RAISE NOTICE 'Constraint already exists';
  END IF;
END $$;