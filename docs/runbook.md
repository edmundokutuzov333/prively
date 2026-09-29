# Prively runbook

## Phase 1 local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_APP_ENV` to the target environment values.
3. Run `npm ci`.
4. Run `npm run check`.
5. Run `npm run dev` and inspect `/` and `/system` in a development build.

No production secret belongs in `VITE_*` variables. Only the Supabase public URL and publishable key may be exposed to the browser.

## Phase 2

The development experience surface is available in a development build. Use these route groups:

- Client: `/descobrir`, `/feed`, `/c/:handle`, `/post/:id`, `/mensagens`, `/mensagens/:id`, `/carteira`, `/compras`, `/desejos`, `/definicoes/*`
- Creator: `/estudio/*`
- Public/information: `/sobre`, `/ajuda`, `/legal/*`, `/se-criadora`

These routes intentionally do not fabricate domain data. Production exposure remains disabled until the corresponding backend authority is implemented.

## Phase 3

Phase 3 introduces the real monetization and advanced operations surface.

Client routes:
- `/carteira`: ledger-backed wallet summary.
- `/lives` and `/live/:sessionId`: paid/free LiveKit sessions.
- `/pedidos?channel=<real-channel-id>`: custom requests funded in escrow.
- `/leilao/:auctionId`: server-authoritative bidding.
- `/loja`: real product inventory and escrow-backed orders.
- `/recompensas`: configured loyalty state and streaks.

Creator routes:
- `/estudio/loja`
- `/estudio/pedidos`
- `/estudio/leiloes`
- `/estudio/lives`
- `/estudio/analitica`
- `/estudio/fas`
- `/estudio/metas`
- `/estudio/referral`
- `/estudio/respostas`

Infrastructure:
- SQL migrations live under `supabase/migrations`.
- pgTAP database tests live under `supabase/tests/database`.
- Edge Functions live under `supabase/functions`.
- LiveKit secrets are server-side only: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- The browser only receives short-lived LiveKit tokens and signed media URLs.

Before production:
1. Create/configure the dedicated Prively Supabase project.
2. Apply migrations and run `supabase test db`.
3. Configure the private storage bucket and LiveKit secrets.
4. Deploy the Edge Functions.
5. Validate payment provider/top-up integration before enabling wallet funding.
6. Set `phase3Monetization` to true only after CI, database tests, provider checks and operational review are green.
