begin;
select plan(14);

select ok(to_regclass('public.role_permissions') is not null,'role_permissions exists');
select ok(to_regclass('public.consent_records') is not null,'consent_records exists');
select ok(to_regclass('public.legal_acceptances') is not null,'legal_acceptances exists');
select ok(to_regclass('public.auth_sessions') is not null,'auth_sessions exists');
select ok(to_regclass('public.trusted_devices') is not null,'trusted_devices exists');
select ok(to_regclass('public.self_exclusions') is not null,'self_exclusions exists');
select ok(to_regclass('public.security_events') is not null,'security_events exists');

select ok((select relrowsecurity from pg_class where oid='public.consent_records'::regclass),'consent RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.auth_sessions'::regclass),'session RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.trusted_devices'::regclass),'device RLS enabled');
select ok(to_regprocedure('public.has_permission(uuid,text)') is not null,'permission function exists');
select ok(to_regprocedure('public.record_legal_acceptance(text,text,text,jsonb)') is not null,'legal acceptance RPC exists');
select ok(to_regprocedure('public.start_self_exclusion(timestamptz,text)') is not null,'self exclusion RPC exists');
select ok(to_regprocedure('public.submit_kyc(text,text,text)') is not null,'KYC submit RPC exists');

do $$
declare
  client_id uuid:='20000000-0000-0000-0000-000000000001';
  creator_id uuid:='20000000-0000-0000-0000-000000000002';
  admin_id uuid:='20000000-0000-0000-0000-000000000003';
  sid uuid:='30000000-0000-0000-0000-000000000001';
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (client_id,'authenticated','authenticated','phase4-client@example.test','test','{"handle":"phase4_client"}'::jsonb),
    (creator_id,'authenticated','authenticated','phase4-creator@example.test','test','{"handle":"phase4_creator"}'::jsonb),
    (admin_id,'authenticated','authenticated','phase4-admin@example.test','test','{"handle":"phase4_admin"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles set status='active',age_verified_at=now() where id in (client_id,creator_id,admin_id);
  insert into public.user_roles(user_id,role) values
    (client_id,'client'),
    (creator_id,'creator'),
    (admin_id,'admin')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub',client_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',client_id::text,'role','authenticated','aal','aal1','session_id',sid::text)::text,true);

  perform public.record_consent('age_gate','1.0');
  perform public.record_legal_acceptance('terms','1.0');
  perform public.record_legal_acceptance('privacy','1.0');
  perform public.register_current_session('Test Browser',encode(digest('ua','sha256'),'hex'),null);

  if not public.has_permission(client_id,'security.profile.update') then
    raise exception 'client permission missing';
  end if;
  if public.has_permission(client_id,'admin.control_room') then
    raise exception 'client received admin permission';
  end if;

  perform public.start_self_exclusion(now()+interval '1 day','test');
  if public.is_age_verified(client_id) then
    raise exception 'self excluded client still age verified';
  end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',admin_id::text,'role','authenticated','aal','aal1','session_id',sid::text)::text,true);
  if public.has_permission(admin_id,'admin.control_room') then
    raise exception 'admin control room permitted at aal1';
  end if;

  perform set_config('request.jwt.claims',json_build_object('sub',admin_id::text,'role','authenticated','aal','aal2','session_id',sid::text)::text,true);
  if not public.has_permission(admin_id,'admin.control_room') then
    raise exception 'admin control room denied at aal2';
  end if;

  perform public.set_account_state(client_id,'suspended','test suspension');
  if (select status from public.profiles where id=client_id)<>'suspended' then
    raise exception 'account state transition failed';
  end if;

  perform set_config('request.jwt.claims',json_build_object('sub',client_id::text,'role','authenticated','aal','aal1','session_id',sid::text)::text,true);
  if (select count(*) from public.consent_records where user_id<>client_id)>0 then
    raise exception 'client can see another users consents';
  end if;
  if (select count(*) from public.security_events where user_id<>client_id)>0 then
    raise exception 'client can see another users security events';
  end if;

  reset role;
end $$;

select * from finish();
rollback;