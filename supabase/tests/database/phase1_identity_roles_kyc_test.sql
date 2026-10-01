begin;
select plan(18);

select ok(to_regclass('public.user_roles') is not null, 'user_roles exists');
select ok(to_regclass('public.kyc_verifications') is not null, 'kyc_verifications exists');
select ok((select relrowsecurity from pg_class where oid='public.user_roles'::regclass), 'user_roles RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.kyc_verifications'::regclass), 'kyc RLS enabled');
select ok((select public::text is not null), 'placeholder');

do $$
declare
  client_id uuid := '71000000-0000-0000-0000-000000000001';
  compliance_id uuid := '71000000-0000-0000-0000-000000000002';
  kyc_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (client_id,'authenticated','authenticated','phase1-client@example.test','test','{"handle":"phase1_client"}'::jsonb),
    (compliance_id,'authenticated','authenticated','phase1-compliance@example.test','test','{"handle":"phase1_compliance"}'::jsonb)
  on conflict(id) do nothing;

  perform set_config('app.internal_write','on',true);

  insert into public.profiles(id,handle,display_name,status)
  values
    (client_id,'phase1_client','Phase 1 Client','pending'),
    (compliance_id,'phase1_compliance','Phase 1 Compliance','active')
  on conflict(id) do nothing;

  insert into public.user_roles(user_id,role)
  values
    (client_id,'client'),
    (compliance_id,'compliance')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub',client_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',client_id::text,'role','authenticated','aal','aal1')::text,true);

  update public.profiles
  set status='active',
      age_verified_at=now(),
      self_excluded_until=now()+interval '1 day'
  where id=client_id;

  if (select status from public.profiles where id=client_id)<>'pending'
     or (select age_verified_at from public.profiles where id=client_id) is not null
     or (select self_excluded_until from public.profiles where id=client_id) is not null then
    raise exception 'protected profile fields changed';
  end if;

  if public.has_role(client_id,'admin') then
    raise exception 'client unexpectedly has admin role';
  end if;

  begin
    insert into public.user_roles(user_id,role) values(client_id,'admin');
    raise exception 'client inserted own role';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.kyc_verifications(user_id,provider,status,doc_type,doc_path,selfie_path)
  values(client_id,'manual','pending','identity_document',client_id::text||'/doc.jpg',client_id::text||'/selfie.jpg')
  returning id into kyc_id;

  if (select count(*) from public.kyc_verifications where user_id=client_id)<>1 then
    raise exception 'own kyc read failed';
  end if;

  perform set_config('app.internal_write','on',true);
  update public.profiles
  set status='active',age_verified_at=now(),self_excluded_until=null
  where id=client_id;

  if public.is_age_verified(client_id) then
    raise exception 'pending kyc unexpectedly age verified';
  end if;

  update public.kyc_verifications set status='approved',reviewed_by=compliance_id,reviewed_at=now()
  where id=kyc_id;

  if not public.is_age_verified(client_id) then
    raise exception 'approved kyc did not age verify';
  end if;

  update public.kyc_verifications set status='rejected' where id=kyc_id;
  if public.is_age_verified(client_id) then
    raise exception 'rejected kyc remained age verified';
  end if;

  if has_function_privilege('authenticated','public.approve_kyc(uuid,boolean,text,uuid)','EXECUTE') then
    raise exception 'authenticated can execute approve_kyc';
  end if;

  if not has_function_privilege('service_role','public.approve_kyc(uuid,boolean,text,uuid)','EXECUTE') then
    raise exception 'service_role cannot execute approve_kyc';
  end if;
end $$;

select is((select count(*) from pg_policies where schemaname='public' and tablename='user_roles' and policyname='roles_own_read'),1::bigint,'own role read policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='user_roles' and policyname='admin_manage_all'),1::bigint,'admin role write policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='kyc_verifications' and policyname='user reads own kyc status'),1::bigint,'own KYC read policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='kyc_verifications' and policyname='user creates own kyc request'),1::bigint,'own KYC insert policy exists');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='prively_kyc_owner_insert'),1::bigint,'private KYC insert policy exists');
select is((select public from storage.buckets where id='prively-kyc'),false,'KYC bucket is private');
select ok(to_regprocedure('public.submit_kyc(text,text,text,text)') is not null,'submit_kyc hardened signature exists');
select ok(to_regprocedure('public.is_age_verified(uuid)') is not null,'is_age_verified exists');

select * from finish();
rollback;