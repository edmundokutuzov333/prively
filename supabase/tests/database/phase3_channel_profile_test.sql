begin;

select plan(21);

select ok(to_regclass('public.channels') is not null,'channels table exists');
select ok(
  to_regprocedure('public.update_creator_channel(uuid,text,text,text,text,text,text)') is not null,
  'creator channel update RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_creator_channel(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'creator channel update RPC is executable by authenticated'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_creator_channel(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute creator channel update RPC'
);
select ok(
  not has_table_privilege('authenticated','public.channels','UPDATE'),
  'authenticated cannot update channels directly'
);
select ok(
  lower(pg_get_functiondef(
    'public.update_creator_channel(uuid,text,text,text,text,text,text)'::regprocedure
  )) like '%raise exception ''channel_forbidden''%',
  'update RPC has channel_forbidden guard'
);
select ok(
  lower(pg_get_functiondef(
    'public.update_creator_channel(uuid,text,text,text,text,text,text)'::regprocedure
  )) like '%raise exception ''channel_handle_taken''%',
  'update RPC has channel_handle_taken guard'
);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('75000000-0000-0000-0000-000000000001','authenticated','authenticated','phase3-profile-creator@example.test','test','{}'::jsonb),
  ('75000000-0000-0000-0000-000000000002','authenticated','authenticated','phase3-profile-other@example.test','test','{}'::jsonb),
  ('75000000-0000-0000-0000-000000000003','authenticated','authenticated','phase3-profile-viewer@example.test','test','{}'::jsonb)
on conflict(id) do nothing;

select set_config('app.internal_write','on',true);

insert into public.profiles(id,handle,display_name,status)
values
  ('75000000-0000-0000-0000-000000000001','phase3_profile_creator','Phase 3 Profile Creator','active'),
  ('75000000-0000-0000-0000-000000000002','phase3_profile_other','Phase 3 Profile Other','active'),
  ('75000000-0000-0000-0000-000000000003','phase3_profile_viewer','Phase 3 Profile Viewer','active')
on conflict(id) do nothing;

insert into public.user_roles(user_id,role)
values
  ('75000000-0000-0000-0000-000000000001','creator'),
  ('75000000-0000-0000-0000-000000000002','creator')
on conflict do nothing;

insert into public.platform_settings(key,value)
values('legal.creator_terms_version','"1.0"'::jsonb)
on conflict(key) do update set value=excluded.value;

set local role service_role;

insert into public.kyc_verifications(id,user_id,provider,status,created_at)
values
  ('75000000-0000-0000-0000-000000000101','75000000-0000-0000-0000-000000000001','manual','approved',now()),
  ('75000000-0000-0000-0000-000000000102','75000000-0000-0000-0000-000000000002','manual','approved',now())
on conflict(id) do nothing;

update public.profiles
set age_verified_at=now(), status='active'
where id in (
  '75000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000002'
);

insert into public.creator_terms_acceptances(
  id,user_id,version,accepted_at,source,declarations,metadata
)
values
  ('75000000-0000-0000-0000-000000000201','75000000-0000-0000-0000-000000000001','1.0',now(),'phase3-profile-test','{}'::jsonb,'{}'::jsonb),
  ('75000000-0000-0000-0000-000000000202','75000000-0000-0000-0000-000000000002','1.0',now(),'phase3-profile-test','{}'::jsonb,'{}'::jsonb)
on conflict(id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','75000000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select public.create_creator_channel('phase3_profile_one','Phase 3 Profile One','Original bio');
select is(
  (select count(*) from public.channels where handle='phase3_profile_one'),
  1::bigint,
  'creator profile fixture channel exists'
);

select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','75000000-0000-0000-0000-000000000002',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select public.create_creator_channel('phase3_profile_two','Phase 3 Profile Two','Other bio');

select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','75000000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select is(
  public.update_creator_channel(
    (select id from public.channels where handle='phase3_profile_one'),
    'phase3_profile_updated',
    'Phase 3 Profile Updated',
    'Updated bio',
    'Maputo',
    'KaMpfumo',
    'Maputo'
  ),
  (select id from public.channels where handle='phase3_profile_updated'),
  'creator can update own channel through RPC'
);

select is(
  (select display_name from public.channels where handle='phase3_profile_updated'),
  'Phase 3 Profile Updated',
  'updated channel name persisted'
);
select is(
  (select bio from public.channels where handle='phase3_profile_updated'),
  'Updated bio',
  'updated channel bio persisted'
);
select is(
  (select bairro from public.channels where handle='phase3_profile_updated'),
  'KaMpfumo',
  'updated channel location persisted'
);

select throws_ok(
  $$select public.update_creator_channel(
      (select id from public.channels where handle='phase3_profile_updated'),
      'phase3_profile_two',
      'Collision',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'channel_handle_taken',
  'duplicate profile handle is rejected'
);

select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','75000000-0000-0000-0000-000000000002',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select throws_ok(
  $$select public.update_creator_channel(
      (select id from public.channels where handle='phase3_profile_updated'),
      'phase3_other_forbidden',
      'Forbidden Edit',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'channel_forbidden',
  'another creator cannot edit someone else channel'
);

select set_config('request.jwt.claim.sub','75000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','75000000-0000-0000-0000-000000000003',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select is(
  (select count(*) from public.channels where handle='phase3_profile_updated'),
  1::bigint,
  'authenticated viewer can read real non-seed channel'
);

set local role service_role;
insert into public.channels(id,owner_id,handle,display_name,is_seed)
values(
  '75000000-0000-0000-0000-000000000301',
  '75000000-0000-0000-0000-000000000001',
  'phase3_profile_seed',
  'Phase 3 Profile Seed',
  true
);

set local role authenticated;
select is(
  (select count(*) from public.channels where handle='phase3_profile_seed'),
  0::bigint,
  'seed channel remains hidden from authenticated viewer'
);

set local role service_role;
select ok(
  exists(
    select 1
    from public.security_events
    where user_id='75000000-0000-0000-0000-000000000001'::uuid
      and event_type='channel.updated'
      and metadata->>'handle'='phase3_profile_updated'
  ),
  'channel profile update writes a security event'
);

select * from finish();
rollback;
