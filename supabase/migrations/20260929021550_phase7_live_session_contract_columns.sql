-- Restore the live-session columns required by the phase 7 contract migrations.
-- This is intentionally forward-only: the production database already has these
-- columns, while a clean local rebuild needs their definitions before 021600.

alter table public.live_sessions
  add column if not exists per_minute_price bigint,
  add column if not exists private_client_id uuid references public.profiles(id),
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists billed_minutes integer not null default 0,
  add column if not exists end_reason text;

alter table public.live_sessions
  drop constraint if exists live_sessions_mode_check;

alter table public.live_sessions
  add constraint live_sessions_mode_check
  check (mode in ('free','paid','private'));
