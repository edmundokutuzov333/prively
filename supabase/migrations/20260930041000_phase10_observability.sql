
create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  path text,
  message text not null,
  stack_excerpt text,
  build_id text,
  user_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.client_error_events enable row level security;
revoke all on public.client_error_events from anon,authenticated;

create index if not exists client_error_events_created_idx
  on public.client_error_events(created_at desc);
create index if not exists client_error_events_fingerprint_idx
  on public.client_error_events(fingerprint,created_at desc);

grant execute on function public.phase10_assert_rate_limit(text,text,integer,integer) to service_role;

insert into public.platform_settings(key,value)
values ('production.error_tracking','true'::jsonb)
on conflict(key) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname='prively-phase10-error-retention';

select cron.schedule(
  'prively-phase10-error-retention',
  '30 3 * * *',
  $$delete from public.client_error_events where created_at < now() - interval '30 days'$$
);
