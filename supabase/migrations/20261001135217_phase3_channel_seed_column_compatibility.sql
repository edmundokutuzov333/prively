-- Phase 3 local-order compatibility for channel seed visibility.
-- Forward-only. Production already has the column through the reconciled
-- Phase 3 channel migrations, so this is a no-op there.

alter table public.channels
  add column if not exists is_seed boolean not null default false;

comment on column public.channels.is_seed is
  'Development/test marker. Seed channels are excluded from public discovery.';
