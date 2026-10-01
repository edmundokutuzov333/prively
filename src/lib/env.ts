import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default(import.meta.env.PROD ? 'production' : 'development'),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
});

// Supabase publishable keys are intentionally public. Keep a production-safe fallback so a
// missing Vercel build variable cannot prevent the entire React bundle from booting.
const productionFallback = import.meta.env.PROD
  ? {
      VITE_SUPABASE_URL: 'https://gaonupelgtpfthouyobh.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nOlc5uc4GLZQzLTYpytHwA_mhlPtPcK',
    }
  : {};

const testDefaults = import.meta.env.MODE === 'test'
  ? {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? 'https://test-project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'test_publishable_key_0000000000000000',
    }
  : {};

const parsed = schema.safeParse({
  ...productionFallback,
  ...import.meta.env,
  ...testDefaults,
});

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Configuração do frontend inválida. Campos: ${fields}`);
}

export const env = parsed.data;
