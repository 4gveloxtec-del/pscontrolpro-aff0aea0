-- Recriar o trigger on_auth_user_created que dispara handle_new_user()
-- Este trigger é essencial para criar automaticamente profile + role para novos usuários

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();