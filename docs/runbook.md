# Prively runbook

## Phase 1 local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the real Supabase project values.
3. Run `npm install`.
4. Run `npm run check`.
5. Run `npm run dev` and inspect `/` and `/system` in a development build.

No production secret belongs in `VITE_*` variables. Only the Supabase public URL and anonymous key may be exposed to the browser.

## Phase 2

The development experience surface is available in a development build. Use these route groups:

- Client: `/descobrir`, `/feed`, `/c/:handle`, `/post/:id`, `/mensagens`, `/mensagens/:id`, `/carteira`, `/compras`, `/desejos`, `/definicoes/*`
- Creator: `/estudio/*`
- Public/information: `/sobre`, `/ajuda`, `/legal/*`, `/se-criadora`

These routes intentionally do not fabricate domain data. Production exposure remains disabled until the corresponding backend authority is implemented.
