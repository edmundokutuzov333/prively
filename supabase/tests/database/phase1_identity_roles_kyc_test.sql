begin;
select plan(18);

select ok(to_regclass('public.user_roles') is not null, 'user_roles exists');
select ok(to_regclass('public.kyc_verifications') is not null, 'kyc_verifications exists');
select ok((select relrowsecurity from pg_class where oid='public.user_roles'::regclass), 'user_roles RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.kyc_verifications'::regclass), 'kyc RLS enabled');

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('71000000-0000-0000-0000-000000000001','authenticated','authenticated','phase1-client@example.test','test','{"handle":"phase1_client"}'::jsonb),
  ('71000000-0000-0000-0000-000000000002','authenticated','authenticated','phase1-compliance@example.test','test','{"handle":"phase1_compliance"}'::jsonb)
on conflict(id) do nothing;

select set_config('app.internal_write','on',true);

insert into public.profiles(id,handle,display_name,status)
values
  ('71000000-0000-0000-0000-000000000001','phase1_client','Phase 1 Client','pending'),
  ('71000000-0000-0000-0000-000000000002','phase1_compliance','Phase 1 Compliance','active')
on conflict(id) do nothing;

insert into public.user_roles(user_id,role)
values
  ('71000000-0000-0000-0000-000000000001','client'),
  ('71000000-0000-0000-0000-000000000002','compliance')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object('sub','71000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1')::text,true);
select set_config('app.internal_write','off',true);

select throws_ok(
  'update public.profiles set status=''active'', age_verified_at=now(), self_excluded_until=now()+interval ''1 day'' where id=''71000000-0000-0000-0000-000000000001''',
  '42501',
  'normal user cannot change protected profile fields'
);

select is((select status from public.profiles where id='71000000-0000-0000-0000-000000000001'),'pending','protected status cannot be changed by normal user');
select ok((select age_verified_at from public.profiles where id='71000000-0000-0000-0000-000000000001') is null,'protected age_verified_at cannot be changed');
select ok((select self_excluded_until from public.profiles where id='71000000-0000-0000-0000-000000000001') is null,'protected self exclusion cannot be changed');

select ok(public.has_role('71000000-0000-0000-0000-000000000001','admin'::public.app_role) = false,'unassigned admin role returns false');

do $$
begin
  begin
    insert into public.user_roles(user_id,role)
    values('71000000-0000-0000-0000-000000000001','admin');
    raise exception 'client_inserted_role';
  exception when insufficient_privilege then
    null;
  end;
end $$;

insert into public.kyc_verifications(user_id,provider,status,doc_type,doc_path,selfie_path)
values('71000000-0000-0000-0000-000000000001','manual','pending','identity_document','71000000-0000-0000-0000-000000000001/doc.jpg','71000000-0000-0000-0000-000000000001/selfie.jpg');

select is((select count(*) from public.kyc_verifications where user_id='71000000-0000-0000-0000-000000000001'),1::bigint,'user can read own KYC row');

select set_config('app.internal_write','on',true);
update public.profiles
set status='active',age_verified_at=now(),self_excluded_until=null
where id='71000000-0000-0000-0000-000000000001';

select ok(public.is_age_verified('71000000-0000-0000-0000-000000000001') = false,'pending KYC is not age verified');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
select public.approve_kyc(
  (select id from public.kyc_verifications where user_id='71000000-0000-0000-0000-000000000001' limit 1),
  true,
  'phase1-test-approved',
  '71000000-0000-0000-0000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object('sub','71000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1')::text,true);

select ok(public.is_age_verified('71000000-0000-0000-0000-000000000001') = true,'approved KYC enables age verification');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
select public.approve_kyc(
  (select id from public.kyc_verifications where user_id='71000000-0000-0000-0000-000000000001' limit 1),
  false,
  'phase1-test-rejected',
  '71000000-0000-0000-0000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object('sub','71000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1')::text,true);
select ok(public.is_age_verified('71000000-0000-0000-0000-000000000001') = false,'rejected KYC disables age verification');

select ok(not exists(
  select 1
  from information_schema.routine_privileges
  where routine_schema='public'
    and routine_name='approve_kyc'
    and grantee='authenticated'
    and privilege_type='EXECUTE'
),'authenticated cannot execute approve_kyc');

reset role;

select is((select count(*) from pg_policies where schemaname='public' and tablename='user_roles' and policyname='roles_own_read'),1::bigint,'role read RLS policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='user_roles' and policyname='admin_manage_all'),1::bigint,'role write RLS policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='kyc_verifications' and policyname='user reads own kyc status'),1::bigint,'KYC read RLS policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='kyc_verifications' and policyname='user creates own kyc request'),1::bigint,'KYC write RLS policy exists');
select is((select public from storage.buckets where id='prively-kyc'),false,'KYC storage is private');

select * from finish();
rollback;