import { createClient } from '@supabase/supabase-js';

const PRILY_SUPABASE_URL = 'https://gaonupelgtpfthouyobh.supabase.co';
const PRILY_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nOlc5uc4GLZQzLTYpytHwA_mhlPtPcK';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || PRILY_SUPABASE_URL;
const publishableKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || PRILY_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}
