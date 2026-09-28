-- Phase 7 Web Push delivery state and safe notification dispatch contract.

alter table public.notifications
  add column if not exists push_delivered_at timestamptz;

create index if not exists notifications_push_pending_idx
  on public.notifications(user_id,created_at)
  where push_delivered_at is null;

insert into public.platform_settings(key,value)
values
  ('feature_flags.push','false'::jsonb),
  ('push.provider','web-push'::jsonb)
on conflict(key) do nothing;
