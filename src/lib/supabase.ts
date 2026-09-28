import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PRONLY_SUPABASE_URL = 'https://gaonupelgtpfthouyobh.supabase.co';
const PRONLY_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nOlc5uc4GLZQzLTYpytHwA_mhlPtPcK';

export const supabaseProjectRef = 'gaonupelgtpfthouyobh';
export const supabaseConfigured = true;

export const supabase: SupabaseClient = createClient(
  PRONLY_SUPABASE_URL,
  PRONLY_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: {
        'x-prively-client': 'web'
      }
    }
  }
);

export function requireSupabase(): SupabaseClient {
  return supabase;
}
