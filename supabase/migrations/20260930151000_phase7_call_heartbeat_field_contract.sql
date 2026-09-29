-- Phase 7 forward-only repair.
-- Call billing already depends on this server heartbeat field; make the
-- local rebuild deterministic and align it with the live schema contract.

alter table public.call_sessions
  add column if not exists last_heartbeat_at timestamptz;
