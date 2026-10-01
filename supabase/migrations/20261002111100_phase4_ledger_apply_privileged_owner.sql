-- Phase 4 ledger trigger ownership hardening.
-- Forward-only. Keeps the trigger internal and executes it under the
-- privileged service role so RLS cannot block cache maintenance.

alter function public.ledger_apply() owner to service_role;

revoke all on function public.ledger_apply() from public, anon, authenticated;
