import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const supabaseProjectRef = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];

export const supabase: SupabaseClient = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    global: { headers: { 'x-prively-client': 'web' } },
  },
);

export function requireSupabase(): SupabaseClient {
  return supabase;
}
