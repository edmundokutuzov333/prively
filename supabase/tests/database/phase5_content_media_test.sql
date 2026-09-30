begin;

select plan(21);

select ok(to_regclass('public.media_uploads') is not null,'media uploads exists');
select ok(to_regclass('public.media_processing_jobs') is not null,'media jobs exists');
select ok(to_regclass('public.media_consents') is not null,'media consents exists');
select ok(to_regclass('public.moderation_scans') is not null,'moderation scans exists');
select ok(to_regclass('public.media_access_logs') is not null,'media access logs exists');
select ok(to_regclass('public.content_archive_events') is not null,'content archive exists');
select ok((select relrowsecurity from pg_class where oid='public.media_uploads'::regclass),'media uploads RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.media_processing_jobs'::regclass),'media jobs RLS enabled');
select ok(not has_function_privilege('anon','public.create_post(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz)','EXECUTE'),'anon cannot create posts');
select ok(not has_function_privilege('anon','public.create_media_upload(uuid,text,text,bigint,text,text,boolean)','EXECUTE'),'anon cannot create media uploads');
select ok(not has_function_privilege('anon','public.publish_post(uuid,timestamptz)','EXECUTE'),'anon cannot publish posts');
select ok(to_regprocedure('public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text)') is not null,'blurhash post creator exists');
select ok(not has_function_privilege('anon','public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text)','EXECUTE'),'anon cannot create blurhash posts');

do $$
declare
  creator uuid:='50000000-0000-0000-0000-000000000001';
  client uuid:='50000000-0000-0000-0000-000000000002';
  v_channel_id uuid;
  v_post_id uuid;
  first_payload jsonb;
  second_payload jsonb;
  v_asset_id uuid;
  v_upload_id uuid;
  v_tier_id uuid;
  ignored text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (creator,'authenticated','authenticated','phase5-creator@example.test','test','{"handle":"phase5_creator"}'::jsonb),
    (client,'authenticated','authenticated','phase5-client@example.test','test','{"handle":"phase5_client"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles
  set status='active',age_verified_at=now()
  where id in (creator,client);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_at)
  values
    (creator,'native-test','approved','native:'||creator::text,now()),
    (client,'native-test','approved','native:'||client::text,now());

  insert into public.creator_terms_acceptances(user_id,version,source,declarations)
  values(
    creator,'1.0.0','native-test',
    jsonb_build_object('identity',true,'consent',true,'rights',true)
  );

  insert into public.legal_acceptances(user_id,document_type,version)
  values
    (creator,'terms','1.0'),
    (creator,'privacy','1.0'),
    (creator,'content_prohibited','1.0'),
    (client,'terms','1.0'),
    (client,'privacy','1.0');

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2',
    'session_id',gen_random_uuid()::text
  )::text,true);

  v_channel_id:=public.create_creator_channel('phase5_channel','Phase 5 Creator','Content engine test');
  v_post_id:=public.create_post_with_blurhash(
    v_channel_id,
    'Phase 5 draft',
    'public',
    null,
    null,
    false,
    null,
    'LEHV6nWB2yk8pyo0adR*.7kCMdnj'
  );

  first_payload:=public.create_media_upload(
    v_post_id,'image','image/png',2048,repeat('a',64),'test.png',true
  );
  second_payload:=public.create_media_upload(
    v_post_id,'image','image/png',2048,repeat('a',64),'test-renamed.png',true
  );

  if (first_payload->>'assetId')<>(second_payload->>'assetId')
     or (first_payload->>'uploadId')<>(second_payload->>'uploadId') then
    raise exception 'resumable upload was not reused';
  end if;

  v_asset_id:=(first_payload->>'assetId')::uuid;
  v_upload_id:=(first_payload->>'uploadId')::uuid;

  insert into public.subscription_tiers(channel_id,name,rank,price_month)
  values(v_channel_id,'Bronze',1,100)
  returning id into v_tier_id;

  perform set_config('app.phase5_asset_id',v_asset_id::text,false);
  perform set_config('app.phase5_post_id',v_post_id::text,false);
  perform set_config('app.phase5_channel_id',v_channel_id::text,false);
  perform set_config('app.phase5_client_id',client::text,false);
  perform set_config('app.phase5_tier_id',v_tier_id::text,false);

  if not exists(
    select 1
    from public.media_uploads
    where id=v_upload_id
      and user_id=creator
      and status='initiated'
  ) then
    raise exception 'media upload session missing';
  end if;

  if not exists(
    select 1
    from public.media_consents mc
    where mc.asset_id=v_asset_id
      and mc.consent_type='rights'
  ) then
    raise exception 'media rights consent missing';
  end if;

  begin
    ignored:=(
      public.create_media_upload(
        v_post_id,'video','video/mp4',104857601,repeat('b',64),'too-large.mp4',true
      )
    )::text;
    raise exception 'oversized video was accepted';
  exception
    when others then
      if sqlerrm<>'file_too_large' then
        raise;
      end if;
  end;

  perform set_config('app.internal_write','on',true);

  insert into public.media_processing_jobs(asset_id,job_type,status,processor)
  values
    (v_asset_id,'integrity','succeeded','test'),
    (v_asset_id,'moderation','succeeded','test'),
    (v_asset_id,'thumbnail','succeeded','test'),
    (v_asset_id,'watermark','succeeded','test')
  on conflict(asset_id,job_type) do update
  set status='succeeded',processor='test',error_code=null,error_message=null;

  update public.media_assets
  set integrity_status='verified',
      moderation_status='clean',
      scan_status='clean',
      processing_status='processing',
      thumb_blur_path='50000000-0000-0000-0000-000000000001/media/'||v_asset_id::text||'/derivatives/thumb.webp',
      watermark_path='50000000-0000-0000-0000-000000000001/media/'||v_asset_id::text||'/derivatives/watermark.webp',
      ready_at=null
  where id=v_asset_id;

  if public.refresh_media_processing_status(v_asset_id)<>'ready' then
    raise exception 'asset did not reach ready processing state';
  end if;

  update public.media_assets
  set processing_status='processing',
      ready_at=null
  where id=v_asset_id;

  begin
    perform public.publish_post(v_post_id);
    raise exception 'publish_post accepted incomplete media';
  exception
    when others then
      if sqlerrm<>'media_not_ready' then
        raise;
      end if;
  end;

  perform set_config('app.internal_write','on',true);
  update public.posts
  set status='published',publish_at=now(),moderation_status='clean'
  where id=v_post_id;
end $$;

set local role authenticated;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','50000000-0000-0000-0000-000000000002',
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  not public.can_view_post(current_setting('app.phase5_post_id')::uuid),
  'client cannot view while media processing is incomplete'
);

reset role;
update public.media_assets
set processing_status='ready',
    ready_at=now()
where id=current_setting('app.phase5_asset_id')::uuid;
set local role authenticated;

select ok(
  public.can_view_post(current_setting('app.phase5_post_id')::uuid),
  'client can view a fully approved published post'
);

reset role;
update public.kyc_verifications
set status='pending',updated_at=now()
where user_id=current_setting('app.phase5_client_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.phase5_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.phase5_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  not public.can_view_post(
    current_setting('app.phase5_post_id')::uuid,
    current_setting('app.phase5_client_id')::uuid
  ),
  'client without approved KYC cannot view Streamtape media'
);

reset role;
update public.kyc_verifications
set status='approved',updated_at=now()
where user_id=current_setting('app.phase5_client_id')::uuid;

select set_config('app.internal_write','on',true);
update public.posts
set visibility='subscribers'
where id=current_setting('app.phase5_post_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.phase5_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.phase5_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  not public.can_view_post(
    current_setting('app.phase5_post_id')::uuid,
    current_setting('app.phase5_client_id')::uuid
  ),
  'client without subscription cannot view subscriber-only Streamtape media'
);

reset role;
select set_config('app.internal_write','on',true);
insert into public.subscriptions(
  subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,status
)
values(
  current_setting('app.phase5_client_id')::uuid,
  current_setting('app.phase5_channel_id')::uuid,
  current_setting('app.phase5_tier_id')::uuid,
  1,
  100,
  now()+interval '30 days',
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.phase5_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.phase5_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  public.can_view_post(
    current_setting('app.phase5_post_id')::uuid,
    current_setting('app.phase5_client_id')::uuid
  ),
  'subscribed client can view subscriber-only Streamtape media'
);

with access as (
  select public.get_media_access(current_setting('app.phase5_asset_id')::uuid) as value
)
select ok(
  (access.value->>'processing_status')='ready'
  and (access.value->>'watermark_enabled')::boolean,
  'media access returns ready processing state and watermark policy'
)
from access;

select is(
  (select count(*) from public.media_access_logs where user_id=auth.uid() and granted),
  1::bigint,
  'media access is audited'
);

reset role;
select * from finish();
rollback;