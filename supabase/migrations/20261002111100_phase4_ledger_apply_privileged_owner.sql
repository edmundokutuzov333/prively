-- Phase 4 ledger trigger RLS execution hardening.
-- Forward-only. No client write grant is added.
-- The cache remains protected by RLS while this internal trigger bypasses
-- row-security checks only within its own SECURITY DEFINER execution.

alter table public.balances no force row level security;

alter function public.ledger_apply()
  set row_security = off;

revoke all on function public.ledger_apply() from public, anon, authenticated;
