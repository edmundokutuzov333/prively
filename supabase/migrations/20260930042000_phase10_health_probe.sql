
create or replace function public.get_health_probe()
returns integer
language sql
security definer
set search_path=public
as $$
  select 1
$$;

revoke all on function public.get_health_probe() from public,anon,authenticated;
grant execute on function public.get_health_probe() to service_role;
