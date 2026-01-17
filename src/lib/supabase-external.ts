// Cliente Supabase - Usa Lovable Cloud (todas as tabelas já estão prontas)
// Re-exporta o cliente do Lovable Cloud para manter compatibilidade
import { supabase } from '@/integrations/supabase/client';

// Re-export como supabaseExternal para manter compatibilidade com imports existentes
export const supabaseExternal = supabase;

// Exportar as constantes para uso em edge functions (usando Lovable Cloud)
export const SUPABASE_EXTERNAL_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_EXTERNAL_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
