begin;

select is(
  count(*)::integer,
  0,
  'all SECURITY DEFINER public functions pin search_path to public, pg_temp'
)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.prosecdef
  and coalesce(p.proconfig::text, '') not like '%search_path=public, pg_temp%';

select is(
  count(*)::integer,
  0,
  'all public base tables have RLS enabled'
)
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind in ('r','p')
  and not c.relrowsecurity;

select is(
  count(*)::integer,
  0,
  'all public base tables have at least one RLS policy'
)
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind in ('r','p')
  and not exists(
    select 1
    from pg_policies p
    where p.schemaname='public'
      and p.tablename=c.relname
  );

rollback;
