-- Backfill subscription_expires_at for profiles that don't have it set
-- Uses created_at + trial days from app_settings (default 5 days if not configured)

DO $$
DECLARE
  trial_days_value INTEGER;
BEGIN
  -- Get trial days from app_settings, default to 5 if not found
  SELECT COALESCE(value::INTEGER, 5) INTO trial_days_value
  FROM app_settings 
  WHERE key = 'seller_trial_days'
  LIMIT 1;
  
  -- Default to 5 if no setting found
  IF trial_days_value IS NULL THEN
    trial_days_value := 5;
  END IF;

  -- Update profiles that have NULL subscription_expires_at and are not permanent
  -- Only update if created_at is set
  UPDATE profiles
  SET subscription_expires_at = created_at + (trial_days_value || ' days')::INTERVAL
  WHERE subscription_expires_at IS NULL
    AND created_at IS NOT NULL
    AND (is_permanent IS NULL OR is_permanent = false);

  RAISE NOTICE 'Backfilled subscription_expires_at with % trial days', trial_days_value;
END $$;