# Prively Recovery Runbook

## 1. Detect

Check /functions/v1/health, Control Room /admin/production, financial reconciliation, recent Edge Function errors and the current Vercel deployment.

## 2. Frontend incident

Keep the domain unchanged. Roll back to the last verified deployment in Vercel. Do not rewrite main history.

## 3. Database incident

Stop risky write paths through feature flags. Preserve evidence. Do not edit historical migrations. Restore a verified Supabase backup only when required, then apply validated forward migrations.

## 4. Financial incident

Freeze new top-ups, payouts and high-risk business spending if needed. Preserve webhook processing. Reconcile the ledger and provider references before reopening.

## 5. Security incident

Rotate affected secrets. Revoke trusted devices/sessions if compromise is suspected. Preserve immutable audit records. Apply legal hold where required.

## 6. Post-incident

Record root cause, affected scope, timeline, corrective migration or code change, and regression test. The incident is not closed until the relevant production gate is green again.
