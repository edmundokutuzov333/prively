begin;

select plan(8);

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


select ok(
  to_regprocedure('public.purchase_ppv(uuid,text)') is not null
  and has_function_privilege('authenticated','public.purchase_ppv(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.purchase_ppv(uuid,text)','EXECUTE'),
  'purchase_ppv exists with authenticated-only execute'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.ppv_purchases'::regclass)
  and has_table_privilege('authenticated','public.ppv_purchases','SELECT')
  and not has_table_privilege('authenticated','public.ppv_purchases','INSERT')
  and not has_table_privilege('authenticated','public.ppv_purchases','UPDATE')
  and not has_table_privilege('authenticated','public.ppv_purchases','DELETE')
  and exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='ppv_purchases'
      and policyname='buyer reads own purchases'
      and cmd='SELECT'
  ),
  'ppv_purchases is RLS-protected, buyer-readable and client-write protected'
);

select ok(
  pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%_spend_on_channel%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%existing_purchase%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%ppv_not_available%',
  'purchase_ppv has serialized server-side purchase protection'
);

select ok(
  pg_get_functiondef('public.can_view_post(uuid)'::regprocedure) like '%ppv_purchases%'
  and exists(
    select 1 from pg_proc
    where pronamespace='public'::regnamespace
      and proname='_spend_on_channel'
      and pg_get_functiondef(oid) like '%create_financial_receipt%'
  ),
  'PPV visibility and receipt creation are wired into existing contracts'
);

select * from finish();
rollback;
