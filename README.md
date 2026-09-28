# Prively

O teu Privê digital.

Prively is being built as a production platform for adult creator content, social interaction, privacy, safety and monetisation in Mozambique.

The main branch is the integration branch. Phases 1, 2 and 3 are consolidated there, with real frontend code, routing, Supabase migrations, RLS, transactional functions, private storage access, Edge Functions, tests, and production build validation.

Capabilities whose external provider or production infrastructure is not yet configured remain behind feature flags and are not presented as live production functionality.

## Production stack

- React 19 + TypeScript
- Vite + Tailwind CSS 4
- Supabase Auth + PostgreSQL + RLS + Storage + Edge Functions
- LiveKit server-authorised access
- Vitest + database tests
- Vercel deployment
- Node.js 24

## Vercel

The repository contains an explicit Vite/Vercel contract in vercel.json.

Required browser variables in Vercel:

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

The GitHub Actions production workflow can deploy main to the KUTUZOV Vercel team using the VERCEL_TOKEN repository secret. The workflow builds the application before deployment.

Server-only secrets such as SUPABASE_SERVICE_ROLE_KEY and LiveKit API secrets must remain in Supabase Edge Function configuration and are never exposed through Vite environment variables.
