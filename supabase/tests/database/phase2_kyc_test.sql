begin;
select plan(18);

select ok(to_regclass('public.kyc_verifications') is not null,'KYC table exists');
select ok(to_regclass('public.user_roles') is not null,'role table exists');
select ok((select public from storage.buckets where id='prively-kyc') = false,'KYC bucket is private');
select ok(not has_function_privilege('authenticated','public.approve_kyc(uuid,boolean,text,uuid)','EXECUTE'),'authenticated cannot execute approve_kyc');
select ok(not has_function_privilege('authenticated','public.kyc_manual_queue_weekly_volume()','EXECUTE'),'unguarded KYC volume is not public to authenticated');
select ok(has_function_privilege('authenticated','public.kyc_manual_queue_weekly_volume_guarded()','EXECUTE'),'guarded KYC volume is executable by authenticated');
select ok(has_function_privilege('authenticated','public.get_my_kyc_status()','EXECUTE'),'own KYC status detail is executable by authenticated');
select ok((select pg_get_functiondef(p.oid) like '%auth.role() <> ''service_role''%' from pg_proc p where p.oid='public.approve_kyc(uuid,boolean,text,uuid)'::regprocedure),'approval RPC requires service_role execution');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='prively_kyc_owner_insert'),1::bigint,'KYC owner upload policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='prively_kyc_compliance_read'),1::bigint,'KYC compliance read policy exists');

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('72000000-0000-0000-0000-000000000001','authenticated','authenticated','phase2-admin@example.test','test','{"handle":"phase2_admin"}'::jsonb),
  ('72000000-0000-0000-0000-000000000002','authenticated','authenticated','phase2-ordinary@example.test','test','{"handle":"phase2_ordinary"}'::jsonb)
on conflict(id) do nothing;

select set_config('app.internal_write','on',true);

insert into public.profiles(id,handle,display_name,status)
values
  ('72000000-0000-0000-0000-000000000001','phase2_admin','Phase 2 Admin','active'),
  ('72000000-0000-0000-0000-000000000002','phase2_ordinary','Phase 2 Ordinary','active')
on conflict(id) do nothing;

insert into public.user_roles(user_id,role)
values('72000000-0000-0000-0000-000000000001','admin')
on conflict do nothing;

reset role;
set local role service_role;
insert into public.kyc_verifications(id,user_id,provider,status,doc_type,created_at)
select gen_random_uuid(),
       '72000000-0000-0000-0000-000000000002',
       'manual','pending','identity_document',
       date_trunc('week',now()) - (gs * interval '7 days')
from generate_series(0,8) as gs;

set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object('sub','72000000-0000-0000-0000-000000000001','role','authenticated','aud','authenticated','aal','aal2')::text,true);

select is((select count(*) from public.kyc_manual_queue_weekly_volume_guarded()),8::bigint,'guarded weekly volume returns exactly the latest eight weeks');
select is((select min(week_start) from public.kyc_manual_queue_weekly_volume_guarded()),((select max(week_start) from public.kyc_manual_queue_weekly_volume_guarded()) - interval '49 days')::date,'guarded weekly volume spans eight consecutive weeks');

select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object('sub','72000000-0000-0000-0000-000000000002','role','authenticated','aud','authenticated','aal','aal2')::text,true);

select is((select count(*) from public.kyc_manual_queue_weekly_volume_guarded()),0::bigint,'ordinary user receives no KYC weekly volume');
select is((select count(*) from public.kyc_manual_queue_weekly_volume_guarded()),0::bigint,'weekly volume remains hidden without admin.kyc permission');
select ok(public.is_age_verified('72000000-0000-0000-0000-000000000002') = false,'user without approved KYC is not age verified');
select ok(has_function_privilege('authenticated','public.submit_kyc(text,text,text,text)','EXECUTE'),'authenticated can submit KYC through the protected submission RPC');
select is((select count(*) from public.get_my_kyc_status()),1::bigint,'own KYC status returns only the latest row');
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',json_build_object('sub','72000000-0000-0000-0000-000000000001','role','authenticated','aud','authenticated','aal','aal2')::text,true);
select is((select count(*) from public.get_my_kyc_status()),0::bigint,'KYC status RPC cannot expose another user''s request');

select * from finish();
rollback;
