begin;

select plan(26);

select ok(to_regclass('public.channels') is not null, 'channels table exists');
select ok(exists (
  select 1
  from information_schema.columns
  where table_schema='public' and table_name='channels' and column_name='is_seed'
), 'channels has is_seed');
select ok((select relrowsecurity from pg_class where oid='public.channels'::regclass), 'channels RLS enabled');
select ok(not has_table_privilege('authenticated','public.channels','INSERT'), 'authenticated cannot directly insert channels');
select ok(has_function_privilege('authenticated','public.create_creator_channel(text,text,text)','EXECUTE'), 'creator channel RPC is executable by authenticated');
select ok(has_function_privilege('authenticated','public.check_channel_handle(text)','EXECUTE'), 'handle availability RPC is executable by authenticated');
select ok(not has_function_privilege('anon','public.create_creator_channel(text,text,text)','EXECUTE'), 'anonymous users cannot execute creator channel RPC');
select ok(not has_function_privilege('anon','public.check_channel_handle(text)','EXECUTE'), 'anonymous users cannot execute handle availability RPC');

select ok((select pg_get_functiondef(p.oid) like '%RAISE EXCEPTION ''not_creator''%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC has not_creator error');
select ok((select pg_get_functiondef(p.oid) like '%RAISE EXCEPTION ''age_not_verified''%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC has age_not_verified error');
select ok((select pg_get_functiondef(p.oid) like '%RAISE EXCEPTION ''creator_terms_required''%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC has creator_terms_required error');
select ok((select pg_get_functiondef(p.oid) like '%RAISE EXCEPTION ''invalid_channel_handle''%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC has invalid_channel_handle error');
select ok((select pg_get_functiondef(p.oid) like '%RAISE EXCEPTION ''channel_handle_taken''%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC has channel_handle_taken error');
select ok((select pg_get_functiondef(p.oid) like '%is_seed%' from pg_proc p where p.proname='create_creator_channel' and pg_get_function_identity_arguments(p.oid)='text, text, text' limit 1), 'RPC creates non-seed channels');

select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channel_select_public'),1::bigint,'public channel select policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channel_select_owner'),1::bigint,'owner channel select policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channel_update_owner'),1::bigint,'owner channel update policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channel_admin_update'),1::bigint,'admin channel update policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channel_admin_delete'),1::bigint,'admin channel delete policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channels_owner_write'),0::bigint,'legacy broad owner write policy is removed');

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('73000000-0000-0000-0000-000000000001','authenticated','authenticated','phase3-client@example.test','test','{}'::jsonb),
  ('73000000-0000-0000-0000-000000000002','authenticated','authenticated','phase3-no-kyc@example.test','test','{}'::jsonb),
  ('73000000-0000-0000-0000-000000000003','authenticated','authenticated','phase3-creator@example.test','test','{}'::jsonb),
  ('73000000-0000-0000-0000-000000000004','authenticated','authenticated','phase3-viewer@example.test','test','{}'::jsonb)
on conflict(id) do nothing;

select set_config('app.internal_write','on',true);

insert into public.profiles(id,handle,display_name,status)
values
  ('73000000-0000-0000-0000-000000000001','phase3_client','Phase 3 Client','active'),
  ('73000000-0000-0000-0000-000000000002','phase3_no_kyc','Phase 3 No KYC','active'),
  ('73000000-0000-0000-0000-000000000003','phase3_creator','Phase 3 Creator','active'),
  ('73000000-0000-0000-0000-000000000004','phase3_viewer','Phase 3 Viewer','active')
on conflict(id) do nothing;

insert into public.user_roles(user_id,role)
values
  ('73000000-0000-0000-0000-000000000002','creator'),
  ('73000000-0000-0000-0000-000000000003','creator')
on conflict do nothing;

insert into public.platform_settings(key,value)
values('legal.creator_terms_version','"1.0"'::jsonb)
on conflict(key) do update set value=excluded.value;

set local role service_role;

insert into public.kyc_verifications(id,user_id,provider,status,created_at)
values(
  '73000000-0000-0000-0000-000000000301',
  '73000000-0000-0000-0000-000000000003',
  'manual',
  'approved',
  now()
)
on conflict(id) do nothing;

update public.profiles
set age_verified_at=now(), status='active'
where id='73000000-0000-0000-0000-000000000003';

insert into public.creator_terms_acceptances(
  id,user_id,version,accepted_at,source,declarations,metadata
)
values(
  '73000000-0000-0000-0000-000000000401',
  '73000000-0000-0000-0000-000000000003',
  '1.0',
  now(),
  'phase3-test',
  '{}'::jsonb,
  '{}'::jsonb
)
on conflict(id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','73000000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select throws_ok(
  $$select public.create_creator_channel('phase3_client','Phase 3 Client',null)$$,
  'P0001',
  'not_creator',
  'non-creator receives not_creator'
);

select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','73000000-0000-0000-0000-000000000002',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select throws_ok(
  $$select public.create_creator_channel('phase3_nokyc','Phase 3 No KYC',null)$$,
  'P0001',
  'age_not_verified',
  'creator without approved KYC receives age_not_verified'
);

select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','73000000-0000-0000-0000-000000000003',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select throws_ok(
  $$select public.create_creator_channel('bad-handle','Phase 3 Creator',null)$$,
  'P0001',
  'invalid_channel_handle',
  'invalid handle receives invalid_channel_handle'
);

select throws_ok(
  $$select public.create_creator_channel('phase3_display_test','x',null)$$,
  'P0001',
  'display_name_invalid',
  'short public name receives display_name_invalid'
);

select throws_ok(
  $$select public.create_creator_channel('phase3_bio_test','Phase 3 Creator',repeat('x',501))$$,
  'P0001',
  'bio_too_long',
  'oversized bio receives bio_too_long'
);

select public.create_creator_channel('phase3_creator','Phase 3 Creator','Phase 3 channel');
select is(
  (select count(*) from public.channels where owner_id='73000000-0000-0000-0000-000000000003'::uuid and handle='phase3_creator'),
  1::bigint,
  'verified creator receives a real channel'
);

select throws_ok(
  $$select public.create_creator_channel('phase3_creator','Another Name',null)$$,
  'P0001',
  'channel_handle_taken',
  'duplicate handle receives channel_handle_taken'
);

select is(public.check_channel_handle('phase3_creator'),false,'taken handle is reported unavailable');
select is(public.check_channel_handle('phase3_available'),true,'free handle is reported available');

select throws_ok(
  $$insert into public.channels(owner_id,handle,display_name) values ('73000000-0000-0000-0000-000000000003','phase3_direct_insert','Direct Insert')$$,
  '42501',
  NULL,
  'direct channel insert is rejected'
);

set local role service_role;
insert into public.channels(id,owner_id,handle,display_name,is_seed)
values(
  '73000000-0000-0000-0000-000000000501',
  '73000000-0000-0000-0000-000000000003',
  'phase3_seed',
  'Phase 3 Seed',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','73000000-0000-0000-0000-000000000004',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select is(
  (select count(*) from public.channels where id='73000000-0000-0000-0000-000000000501'::uuid),
  0::bigint,
  'seed channel is hidden from other authenticated users'
);

select is(
  (select count(*) from public.channels where handle='phase3_creator'),
  1::bigint,
  'real channel is visible through public authenticated discovery'
);

select ok(
  exists(
    select 1 from public.security_events
    where user_id='73000000-0000-0000-0000-000000000003'::uuid
      and event_type='channel.created'
      and metadata->>'handle'='phase3_creator'
  ),
  'channel creation writes a security event'
);

select * from finish();
rollback;
