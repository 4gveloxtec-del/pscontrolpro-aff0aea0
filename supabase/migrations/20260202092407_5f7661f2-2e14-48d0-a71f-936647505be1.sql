-- Fix existing accounts without roles
-- This inserts 'seller' role for profiles that don't have any role yet
-- SAFE: Only inserts where no role exists, won't duplicate or overwrite

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'seller'::public.app_role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.id IS NULL
  AND p.id IS NOT NULL;

-- Log how many were fixed (visible in migration output)
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.created_at >= NOW() - INTERVAL '1 minute';
  
  RAISE NOTICE 'Fixed % profiles without roles', fixed_count;
END $$;