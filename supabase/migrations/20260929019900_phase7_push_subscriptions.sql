-- Restore the push subscription table required by the phase 7 notification RPCs.
-- Production already contains this contract; this migration makes clean rebuilds
-- reach the later indexes, policies and functions in the same order.

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
on public.push_subscriptions for select to authenticated
using (user_id=(select auth.uid()));
