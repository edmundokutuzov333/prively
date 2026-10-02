begin;
select plan(8);

select ok(to_regprocedure('public.has_role(uuid,public.app_role)') is not null,'has_role exists');
select ok(to_regprocedure('public.grant_creator_role(uuid)') is not null,'grant_creator_role exists');
select ok(not has_function_privilege('authenticated','public.grant_creator_role(uuid)','EXECUTE'),'authenticated cannot execute creator grant RPC');

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('72000000-0000-0000-0000-000000000001','authenticated','authenticated','phase1-creator-client@example.test','test','{"handle":"phase1_creator_client"}'::jsonb),
  ('72000000-0000-0000-0000-000000000002','authenticated','authenticated','phase1-creator-admin@example.test','test','{"handle":"phase1_creator_admin"}'::jsonb)
on conflict(id) do nothing;

select set_config('app.internal_write','on',true);

insert into public.profiles(id,handle,display_name,status,age_verified_at)
values
  ('72000000-0000-0000-0000-000000000001','phase1_creator_client','Phase 1 Creator Client','active',now()),
  ('72000000-0000-0000-0000-000000000002','phase1_creator_admin','Phase 1 Creator Admin','active',now())
on conflict(id) do update
set status=excluded.status,age_verified_at=excluded.age_verified_at;

insert into public.user_roles(user_id,role)
values
  ('72000000-0000-0000-0000-000000000001','client'),
  ('72000000-0000-0000-0000-000000000002','admin')
on conflict do nothing;

insert into public.kyc_verifications(user_id,provider,status,doc_path,selfie_path)
values
  ('72000000-0000-0000-0000-000000000001','manual','approved','72000000-0000-0000-0000-000000000001/doc.jpg','72000000-0000-0000-0000-000000000001/selfie.jpg');

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);

select ok(public.grant_creator_role('72000000-0000-0000-0000-000000000001') = true,'approved and verified user receives creator role');
select ok(public.has_role('72000000-0000-0000-0000-000000000001','creator'::public.app_role) = true,'creator role is persisted');
select ok(public.grant_creator_role('72000000-0000-0000-0000-000000000001') = false,'creator grant is idempotent');
select ok(
  exists(
    select 1 from public.audit_log
    where actor_id='72000000-0000-0000-0000-000000000001'
      and event_type='creator_role_granted'
      and target_type='user_roles'
      and target_id='72000000-0000-0000-0000-000000000001'
  ),
  'creator role grant is audited'
);

insert into public.auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('72000000-0000-0000-0000-000000000003','authenticated','authenticated','phase1-no-kyc@example.test','test','{"handle":"phase1_no_kyc"}'::jsonb)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status)
values
  ('72000000-0000-0000-0000-000000000003','phase1_no_kyc','Phase 1 No KYC','active')
on conflict(id) do nothing;

do $$
begin
  begin
    perform public.grant_creator_role('72000000-0000-0000-0000-000000000003');
    raise exception 'grant_without_kyc_succeeded';
  exception when others then
    if sqlerrm <> 'kyc_required' then raise; end if;
  end;
end $$;

reset role;
select * from finish();
rollback;
