# Prively decisions

## Phase 1

### 2026-09-29: GitHub Actions is the single production delivery path
Production delivery is owned by `.github/workflows/deploy.yml`. The previous standalone Vercel workflow was removed to avoid duplicate production deploy paths. Delivery is triggered only after the `Prively CI` workflow succeeds (or by an explicitly approved manual dispatch), checks out the exact tested SHA, previews Supabase migrations, and runs behind the `production` Environment. The repository owner must configure required reviewers on that Environment before enabling production secrets.

### 2026-09-28: Interface Kernel before full backend
The project is being built in a custom ten-phase execution sequence. Phase 1 establishes the reusable production frontend kernel and design system before the domain backends are introduced in later phases.

This does not make the interface a prototype. Components, routing, i18n, validation, PWA configuration, accessibility primitives and the Supabase authentication client are production code. Capabilities that require backend authority are not exposed as completed product features until their backend phases are implemented.

