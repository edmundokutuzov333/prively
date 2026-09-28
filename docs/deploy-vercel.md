# Prively Vercel deployment

## Project contract

Prively is a Vite SPA. The repository now declares:

- framework: Vite
- build command: `npm run build`
- output directory: `dist`
- SPA catch-all rewrite to `/index.html`
- Node.js: 24.x

Vercel should build the browser application only. PostgreSQL, Auth, Storage and Edge Functions remain in Supabase.

## Required Vercel environment variables

Production and Preview:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The browser must never receive:

- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Those belong to the Supabase Edge Function environment.

## Initial project setup

Create/import a Vercel project from:

`edmundokutuzov333/prively`

Use:

- Root Directory: repository root
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: automatic npm install

Connect the production branch according to the repository integration policy. The production code branch is main. No phase-specific branch should be created for normal implementation.

## Production gate

Do not switch `phase3Monetization` to `true` only because the Vercel build passes. Production also requires:

1. dedicated Prively Supabase project;
2. migrations applied from zero;
3. RLS/pgTAP green;
4. Edge Functions deployed;
5. LiveKit secrets configured in Supabase;
6. payment/KYC providers configured according to their official documentation;
7. critical Playwright flows green;
8. Lighthouse PWA and mobile performance gates green;
9. external legal/security review required by the master specification.

## Current repository validation

GitHub Actions currently validates:

- TypeScript typecheck
- ESLint
- Vitest
- Vite production build
- Supabase local migrations
- pgTAP database tests

A Vercel project is not currently present in the connected KUTUZOV team. Therefore the repository is Vercel-ready, but a live Vercel deployment cannot be truthfully marked as verified until the Vercel project is created/imported and the environment variables are attached.
