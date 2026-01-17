// Cliente Supabase externo do usuário
// Este cliente conecta ao projeto Supabase do usuário (não ao Lovable Cloud)
import { createClient } from '@supabase/supabase-js';

const EXTERNAL_SUPABASE_URL = 'https://tmakvhuphjqwngvpeckj.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtYWt2aHVwaGpxd25ndnBlY2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAwNTcsImV4cCI6MjA4NDI1NjA1N30.yE7QituJmveIaOt70SqvmtxivLIqJoQy89nUeTytN80';

// Validação das credenciais
if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY) {
  throw new Error('Credenciais do Supabase externo não configuradas');
}

export const supabaseExternal = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Exportar as constantes para uso em edge functions
export const SUPABASE_EXTERNAL_URL = EXTERNAL_SUPABASE_URL;
export const SUPABASE_EXTERNAL_ANON_KEY = EXTERNAL_SUPABASE_ANON_KEY;
