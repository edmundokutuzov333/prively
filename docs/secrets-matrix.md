# Prively secrets matrix

Values are configured per environment. Browser variables are public by design; all other values stay in Supabase Edge Function secrets or GitHub Environment secrets.

| Variable | Where it lives | Who defines it | Rotation |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel environment | Engineering | On project/environment change |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel environment | Engineering | On key rotation |
| `VITE_APP_ENV` | Vercel environment | Engineering | On environment change |
| `VITE_VAPID_PUBLIC_KEY` | Vercel environment | Engineering | With VAPID key pair |
| `SUPABASE_URL` | Supabase function secrets | Supabase project | On project/environment change |
| `SUPABASE_ANON_KEY` | Supabase function secrets | Supabase project | On key rotation |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase function secrets | Supabase project owner | Immediately after exposure or scheduled quarterly |
| `APP_ALLOWED_ORIGINS` | Supabase function secrets | Product/engineering | On domain change |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Supabase function secrets | LiveKit owner | Scheduled quarterly and after exposure |
| `MEDIA_SCAN_ENDPOINT`, `MEDIA_SCAN_TOKEN` | Supabase function secrets | Moderation provider owner | Provider policy |
| `MEDIA_PROCESSOR_ENDPOINT`, `MEDIA_PROCESSOR_TOKEN` | Supabase function secrets | Media provider owner | Provider policy |
| `MODERATION_API_URL`, `MODERATION_API_KEY` | Supabase function secrets | Moderation provider owner | Provider policy |
| `AI_RESPONSE_API_URL`, `AI_RESPONSE_API_KEY`, `AI_RESPONSE_PROVIDER_APPROVED` | Supabase function secrets | Product/AI owner | Provider policy and approval change |
| `TRANSLATION_PROVIDER`, `TRANSLATION_APPROVED` | Supabase function secrets | Product owner | Provider policy and approval change |
| `ORDER_SHIPPING_KEY` | Supabase function secrets | Operations owner | Scheduled quarterly |
| `SAFETY_ALERT_WEBHOOK_URL`, `SAFETY_ALERT_WEBHOOK_SECRET` | Supabase function secrets | Safety operations owner | Scheduled quarterly |
| `PRIVELY_PUSH_JOB_TOKEN` | Supabase Vault/function secrets | Engineering | Scheduled monthly |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Supabase function secrets / public key mirrored to Vercel | Engineering | Scheduled yearly and after exposure |
| `PAYSUITE_API_KEY`, `PAYSUITE_CREATE_CHARGE_URL`, `PAYSUITE_PAYOUT_URL` | Supabase function secrets | Finance/provider owner | Provider policy |
| `PAYSUITE_WEBHOOK_SECRET` and header/mode settings | Supabase function secrets | Finance/provider owner | Provider policy |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub `production`/`staging` Environment | Repository owner | Scheduled quarterly |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub `production`/`staging` Environment | Repository owner | Scheduled quarterly |
| `PRIVELY_HEALTH_URL` | GitHub `production` Environment | Operations owner | On health endpoint change |

The connected account currently has no Vercel project named `prively`, and no staging Supabase project was created automatically. Those remain explicit setup actions for the repository owner.
