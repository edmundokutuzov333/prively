begin;

select plan(30);

select ok(to_regclass('public.content_consents') is not null,'content_consents exists');
select ok((select relrowsecurity from pg_class where oid='public.content_consents'::regclass),'content_consents RLS enabled');
select ok(exists(select 1 from pg_constraint where conrelid='public.content_consents'::regclass and conname='content_consents_post_unique'),'one consent per post enforced');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='content_consents' and policyname='content_consents_owner_read'),'consent owner read policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='content_consents' and policyname='content_consents_owner_insert'),'consent owner insert policy exists');
select ok(to_regprocedure('public.attest_post_content_consent(uuid,boolean)') is not null,'consent attestation RPC exists');
select ok(has_function_privilege('authenticated','public.attest_post_content_consent(uuid,boolean)','EXECUTE'),'authenticated can attest content consent');
select ok(not has_table_privilege('authenticated','public.content_consents','INSERT'),'authenticated cannot insert consent rows directly');
select ok(not has_table_privilege('authenticated','public.content_consents','UPDATE'),'authenticated cannot update consent rows directly');
select ok(not has_table_privilege('authenticated','public.content_consents','DELETE'),'authenticated cannot delete consent rows directly');

select ok((select relrowsecurity from pg_class where oid='public.posts'::regclass),'posts RLS enabled');
select ok(not has_table_privilege('authenticated','public.posts','INSERT'),'authenticated cannot insert posts directly');
select ok(not has_table_privilege('authenticated','public.posts','UPDATE'),'authenticated cannot update posts directly');
select ok(not has_table_privilege('authenticated','public.posts','DELETE'),'authenticated cannot delete posts directly');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_visible'),'granular posts visibility policy remains');
select ok(to_regprocedure('public.publish_post(uuid,timestamptz)') is not null,'publish_post RPC exists');
select ok(to_regprocedure('public.publish_scheduled_posts()') is not null,'scheduled publisher exists');
select ok(exists(select 1 from cron.job where jobname='prively-publish-posts' and schedule='* * * * *' and active),'scheduled publication cron is active');
select ok(pg_get_functiondef('public.publish_post(uuid,timestamptz)'::regprocedure) like '%participant_consent_required%','publish_post enforces participant consent');
select ok(pg_get_functiondef('public.publish_scheduled_posts()'::regprocedure) like '%content_consents%','scheduled publisher enforces participant consent');

do $$
declare
  creator uuid := '70000000-0000-0000-0000-000000000001';
  client uuid := '70000000-0000-0000-0000-000000000002';
  channel_id uuid;
  draft_id uuid;
  scheduled_id uuid;
  asset_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (creator,'authenticated','authenticated','phase7-creator@example.test','test','{"handle":"phase7_creator"}'::jsonb),
    (client,'authenticated','authenticated','phase7-client@example.test','test','{"handle":"phase7_client"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles
  set status='active',age_verified_at=now()
  where id in (creator,client);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_by,reviewed_at)
  values(creator,'manual','approved','native:phase7',creator,now())
  on conflict do nothing;

  insert into public.creator_terms_acceptances(user_id,version,source,declarations)
  values(creator,'1.0.0','native-test',jsonb_build_object('identity',true,'consent',true,'rights',true))
  on conflict do nothing;

  insert into public.legal_acceptances(user_id,document_type,version)
  values(creator,'terms','1.0'),(creator,'privacy','1.0'),(creator,'content_prohibited','1.0')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',json_build_object('sub',creator::text,'role','service_role')::text,true);
  set local role service_role;
  channel_id := public.create_creator_channel('phase7_channel','Phase 7 Creator','Publication contract test');
  set local role postgres;

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
  )::text,true);

  draft_id := public.create_post(channel_id,'Phase 7 draft','public',null,null,false,null);

  perform public.attest_post_content_consent(draft_id,true);

  scheduled_id := public.create_post(channel_id,'Phase 7 scheduled','public',null,null,false,null);

  asset_id := gen_random_uuid();
  perform set_config('app.internal_write','on',true);

  insert into public.media_assets(
    id,post_id,channel_id,kind,storage_path,scan_status,integrity_status,
    processing_status,moderation_status,watermark_enabled,metadata,
    storage_provider,streamtape_status,streamtape_attempts
  )
  values(
    asset_id,scheduled_id,channel_id,'image','phase7-test/'||asset_id::text||'.png',
    'clean','verified','ready','clean',true,'{}'::jsonb,
    'backblaze_b2','not_started',0
  );

  perform set_config('app.phase7_draft_id',draft_id::text,false);
  perform set_config('app.phase7_scheduled_id',scheduled_id::text,false);
  perform set_config('app.phase7_channel_id',channel_id::text,false);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','70000000-0000-0000-0000-000000000001',
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select throws_ok(
  $$ select public.attest_post_content_consent(current_setting('app.phase7_scheduled_id')::uuid,false) $$,
  'participant_consent_required',
  'false participant consent is rejected'
);

set local role service_role;
select throws_ok(
  $$ update public.content_consents set participants_adult_confirmed=false where post_id=current_setting('app.phase7_draft_id')::uuid $$,
  'content_consent_is_immutable',
  'content consent cannot be altered'
);
select throws_ok(
  $$ delete from public.content_consents where post_id=current_setting('app.phase7_draft_id')::uuid $$,
  'content_consent_is_immutable',
  'content consent cannot be deleted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','70000000-0000-0000-0000-000000000001',
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

do $$
begin
  begin
    perform public.publish_post(current_setting('app.phase7_scheduled_id')::uuid);
    raise exception 'publish_without_consent_fixture_unexpected_success';
  exception
    when others then
      if sqlerrm <> 'participant_consent_required' then
        raise;
      end if;
  end;
end $;

perform public.attest_post_content_consent(
  current_setting('app.phase7_scheduled_id')::uuid,
  true
);

select ok(
  exists(select 1 from public.content_consents where post_id=current_setting('app.phase7_draft_id')::uuid and participants_adult_confirmed),
  'attestation is persisted for the draft'
);

select throws_ok(
  $$ select public.create_post(current_setting('app.phase7_channel_id')::uuid,'Invalid PPV','ppv',null,null,false,null) $$,
  'ppv_price_required',
  'PPV without price is rejected server-side'
);

perform public.publish_post(
  current_setting('app.phase7_scheduled_id')::uuid,
  now()+interval '2 hours'
);

select is(
  (select status from public.posts where id=current_setting('app.phase7_scheduled_id')::uuid),
  'scheduled',
  'future publication is stored as scheduled'
);

select ok(
  (select publish_at from public.posts where id=current_setting('app.phase7_scheduled_id')::uuid) > now(),
  'scheduled publication time is in the future'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','70000000-0000-0000-0000-000000000002',
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select is(
  (select count(*) from public.posts where id=current_setting('app.phase7_scheduled_id')::uuid),
  0::bigint,
  'scheduled post is not visible to another authenticated user before publish_at'
);

select ok(
  not public.can_view_post(current_setting('app.phase7_scheduled_id')::uuid),
  'can_view_post denies scheduled post before publish_at'
);

reset role;
select is(
  (select count(*) from public.content_consents where post_id=current_setting('app.phase7_scheduled_id')::uuid),
  1::bigint,
  'scheduled post has exactly one consent row'
);

select * from finish();
rollback;