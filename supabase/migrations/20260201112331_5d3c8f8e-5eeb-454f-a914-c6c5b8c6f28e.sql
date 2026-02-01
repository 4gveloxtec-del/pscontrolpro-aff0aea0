-- Fix profiles that don't have subscription_expires_at set
-- This updates profiles where subscription_expires_at is NULL but created_at exists
-- It sets subscription_expires_at = created_at + trial_days (from app_settings)

DO $$
DECLARE
  trial_days_setting INTEGER := 5;
BEGIN
  -- Get trial days from settings
  SELECT COALESCE(NULLIF(value, '')::integer, 5) INTO trial_days_setting
  FROM public.app_settings
  WHERE key = 'seller_trial_days';
  
  IF trial_days_setting IS NULL THEN
    trial_days_setting := 5;
  END IF;

  -- Update profiles where subscription_expires_at is NULL
  UPDATE public.profiles
  SET subscription_expires_at = created_at + (trial_days_setting || ' days')::interval
  WHERE subscription_expires_at IS NULL
    AND created_at IS NOT NULL
    AND is_permanent = false;
    
  RAISE NOTICE 'Updated profiles with trial_days: %', trial_days_setting;
END $$;

-- Also update the handle_new_user function to ensure it always sets subscription_expires_at
-- (this is already correctly set in the latest migration, but we'll reinforce it)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INTEGER;
  trial_days INTEGER;
BEGIN
  -- Get trial days from settings (default 5 if not found)
  SELECT COALESCE(NULLIF(value, '')::integer, 5) INTO trial_days
  FROM public.app_settings
  WHERE key = 'seller_trial_days';
  
  IF trial_days IS NULL THEN
    trial_days := 5;
  END IF;

  -- Criar profile com WhatsApp e subscription_expires_at
  INSERT INTO public.profiles (id, email, full_name, whatsapp, subscription_expires_at, is_permanent, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'whatsapp',
    NOW() + (trial_days || ' days')::interval,
    false,
    true
  );

  -- Verificar se é o primeiro usuário
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  IF user_count = 0 THEN
    -- Primeiro usuário é admin permanente
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    UPDATE public.profiles SET is_permanent = true, subscription_expires_at = NULL WHERE id = NEW.id;
  ELSE
    -- Demais usuários são sellers
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');
    -- Create default plans for new seller
    PERFORM create_default_plans_for_seller(NEW.id);
    -- Create default whatsapp templates for new seller
    PERFORM create_default_templates_for_seller(NEW.id);
    -- Create default dynamic menus for new seller (if function exists)
    BEGIN
      PERFORM create_default_dynamic_menus(NEW.id);
    EXCEPTION WHEN undefined_function THEN
      -- Function doesn't exist, skip
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;