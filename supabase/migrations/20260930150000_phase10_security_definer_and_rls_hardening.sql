-- Phase 10 production security hardening.
-- Forward-only: close fail-open public-table gaps and pin every SECURITY DEFINER
-- function in public to a safe search_path.

do $$
declare
  r record;
  policy_name text;
begin
  for r in
    select n.nspname as schema_name,
           c.relname as table_name,
           c.relkind
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p')
  loop
    execute format('alter table %I.%I enable row level security', r.schema_name, r.table_name);

    if not exists (
      select 1
      from pg_policies p
      where p.schemaname=r.schema_name
        and p.tablename=r.table_name
    ) then
      policy_name := left('prively_client_deny_' || r.table_name, 63);
      execute format(
        'create policy %I on %I.%I for all to anon, authenticated using (false) with check (false)',
        policy_name,
        r.schema_name,
        r.table_name
      );
    end if;
  end loop;

  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public, pg_temp',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end;
$$;
