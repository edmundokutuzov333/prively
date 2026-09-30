begin;

do $$
declare
  admin_uid uuid := 'd1000000-0000-0000-0000-000000000001'::uuid;
  compliance_uid uuid := 'd1000000-0000-0000-0000-000000000002'::uuid;
  kyc_id uuid;
begin
  perform set_config('app.internal_write','on',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
  values
    (admin_uid,'authenticated','authenticated','aal2.admin@example.test','test','{"handle":"aal2_admin"}',now(),now(),now()),
    (compliance_uid,'authenticated','authenticated','aal2_compliance@example.test','test','{"handle":"aal2_compliance"}',now(),now(),now())
  on conflict(id) do nothing;

  insert into public.profiles(id,handle,display_name,status,age_verified_at)
  values
    (admin_uid,'aal2_admin','AAL2 Admin','active',now()),
    (compliance_uid,'aal2_compliance','AAL2 Compliance','active',now())
  on conflict(id) do nothing;

  insert into public.user_roles(user_id,role)
  values
    (admin_uid,'admin'),
    (compliance_uid,'compliance')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,provider_ref)
  values(compliance_uid,'native-aal2-test','pending','native-aal2:'||compliance_uid::text)
  on conflict do nothing
  returning id into kyc_id;

  if kyc_id is null then
    select id into kyc_id
    from public.kyc_verifications
    where user_id=compliance_uid
      and provider='native-aal2-test'
    order by created_at desc
    limit 1;
  end if;

  perform set_config('app.internal_write','off',true);

  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',admin_uid::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal1',
      'session_id',gen_random_uuid()::text
    )::text,true
  );

  if exists(select 1 from public.get_admin_kyc_queue(10)) then
    raise exception 'FAIL: AAL1 accessed admin KYC queue';
  end if;

  begin
    perform public.approve_kyc(kyc_id,true,'aal2 test');
    raise exception 'FAIL: AAL1 approved KYC';
  exception when others then
    if sqlerrm <> 'forbidden' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',admin_uid::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal2',
      'session_id',gen_random_uuid()::text
    )::text,true
  );

  if not exists(select 1 from public.get_admin_kyc_queue(10)) then
    raise exception 'FAIL: AAL2 could not access admin KYC queue';
  end if;

  perform set_config('request.jwt.claim.sub',compliance_uid::text,true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',compliance_uid::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal1',
      'session_id',gen_random_uuid()::text
    )::text,true
  );

  if public.phase8_can_compliance_read(compliance_uid) then
    raise exception 'FAIL: AAL1 compliance access guard returned true';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',compliance_uid::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal2',
      'session_id',gen_random_uuid()::text
    )::text,true
  );

  if not public.phase8_can_compliance_read(compliance_uid) then
    raise exception 'FAIL: AAL2 compliance access guard returned false';
  end if;
end
$$;

select ok(
  pg_get_functiondef('public.phase8_can_compliance_read(uuid)'::regprocedure) ilike '%auth.jwt%aal%'
  and pg_get_functiondef('public.get_admin_kyc_queue(integer)'::regprocedure) ilike '%has_permission%'
  and pg_get_functiondef('public.approve_kyc(uuid,boolean,text)'::regprocedure) ilike '%has_permission%',
  'sensitive admin paths remain server-gated'
);

rollback;
