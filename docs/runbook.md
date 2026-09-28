# Prively runbook

## Phase 1 local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the real Supabase project values.
3. Run `npm install`.
4. Run `npm run check`.
5. Run `npm run dev` and inspect `/` and `/system` in a development build.

No production secret belongs in `VITE_*` variables. Only the Supabase public URL and anonymous key may be exposed to the browser.
