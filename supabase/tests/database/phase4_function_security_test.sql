begin;
select plan(8);

select ok(not has_function_privilege('anon','public.has_permission(uuid,text)','EXECUTE'),'anon cannot execute has_permission');
select ok(not has_function_privilege('anon','public.get_admin_users(integer,integer)','EXECUTE'),'anon cannot execute admin users query');
select ok(not has_function_privilege('authenticated','public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)','EXECUTE'),'authenticated cannot execute internal spend helper');
select ok(not has_function_privilege('authenticated','public.reconcile_ledger()','EXECUTE'),'authenticated cannot execute ledger reconcile');
select ok(has_function_privilege('authenticated','public.get_security_overview()','EXECUTE'),'authenticated can read security overview');
select ok(has_function_privilege('authenticated','public.is_age_verified(uuid)','EXECUTE'),'authenticated can execute RLS age helper');
select ok(has_function_privilege('authenticated','public.can_view_post(uuid,uuid)','EXECUTE'),'authenticated can execute RLS media visibility helper');
select ok(not has_function_privilege('anon','public.prively_autoconfirm_email()','EXECUTE'),'anonymous cannot execute auth trigger function');

select * from finish();
rollback;