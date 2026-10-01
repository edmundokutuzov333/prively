create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'running'
    check (status in ('running','succeeded','failed')),
  storage_path text,
  error_message text
);

alter table public.backup_runs enable row level security;

drop policy if exists "admin reads backup runs" on public.backup_runs;
create policy "admin reads backup runs"
on public.backup_runs
for select
to authenticated
using (public.has_permission(auth.uid(),'admin.production'));

revoke all on table public.backup_runs from anon, authenticated;
grant select on table public.backup_runs to authenticated;
grant all on table public.backup_runs to service_role;

create index if not exists idx_backup_runs_started_at
on public.backup_runs(started_at desc);
