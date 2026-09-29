# Prively Production Readiness

## Gate

Production launch remains explicitly disabled until every external blocker is independently validated. The backend exposes the current readiness state through the admin-only get_production_readiness() RPC and the Control Room route /admin/production.

The gate covers database RLS, private storage, ledger reconciliation, critical cron jobs, media and financial security contracts, external security testing, legal review, published Terms and Privacy Policy, KYC provider validation, moderation team validation, backup validation, recovery drill validation, payment provider validation, and explicit launch enablement.

## Operational controls

Client errors are captured through /functions/v1/client-error with strict field sanitisation and rate limiting. Health is available at /functions/v1/health without exposing database internals.

Rate limits are enforced server-side for reports, top-up intents, payout requests and message creation. Chat also retains its dedicated limit.

## Rollback

Frontend rollback: promote a known-good Vercel deployment. Do not rewrite main history.

Database rollback: do not delete or edit applied migrations. Create a forward corrective migration, validate on staging/local Supabase, then apply to production. For destructive corruption or infrastructure failure, restore a verified provider backup and replay only validated forward migrations.

Payment rollback: stop new provider intents with the feature flag, keep webhook verification active, and finish reconciliation before reopening.

## Backups and recovery drill

The repository contains the validation gate and recovery runbook, but actual provider backup restoration requires access to the Supabase backup/restore control plane and a scheduled recovery exercise. That external validation is deliberately not marked complete by code.

## Launch blockers

Legal review, external penetration testing, provider verification, backup restore validation and moderation team verification remain explicit blockers. The system does not self-enable the launch gate.
