import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://gaonupelgtpfthouyobh.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nOlc5uc4GLZQzLTYpytHwA_mhlPtPcK';

const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? DEFAULT_SUPABASE_URL).trim();
const publishableKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();

export const supabaseProjectRef = 'gaonupelgtpfthouyobh';
export const supabaseConfigured = true;

export const supabase: SupabaseClient = createClient(url, publishableKey, {
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
});

export function requireSupabase(): SupabaseClient {
  return supabase;
}
