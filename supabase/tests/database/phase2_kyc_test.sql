begin;
select plan(10);

select ok(to_regclass('public.kyc_verifications') is not null,'KYC table exists');
select ok(to_regclass('public.user_roles') is not null,'role table exists');
select ok((select public from storage.buckets where id='prively-kyc') = false,'KYC bucket is private');
select ok(not has_function_privilege('authenticated','public.approve_kyc(uuid,boolean,text,uuid)','EXECUTE'),'authenticated cannot execute approve_kyc');
select ok(not has_function_privilege('authenticated','public.kyc_manual_queue_weekly_volume()','EXECUTE'),'unguarded KYC volume is not public to authenticated');
select ok(has_function_privilege('authenticated','public.kyc_manual_queue_weekly_volume_guarded()','EXECUTE'),'guarded KYC volume is executable by authenticated');
select ok(has_function_privilege('authenticated','public.get_my_kyc_status()','EXECUTE'),'own KYC status detail is executable by authenticated');
select ok((select pg_get_functiondef(p.oid) like '%ur.role in (''admin'',''compliance'')%' from pg_proc p where p.proname='approve_kyc' limit 1),'approval RPC enforces admin or compliance reviewer role');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='prively_kyc_owner_insert'),1::bigint,'KYC owner upload policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='prively_kyc_compliance_read'),1::bigint,'KYC compliance read policy exists');

select * from finish();
rollback;
