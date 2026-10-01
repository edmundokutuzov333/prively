begin;

select plan(24);

select ok(to_regprocedure('public.refresh_media_processing_status(uuid)') is not null,'refresh media processing RPC exists');
select ok(not has_function_privilege('authenticated','public.refresh_media_processing_status(uuid)','EXECUTE'),'authenticated cannot force media readiness');
select ok(has_function_privilege('service_role','public.refresh_media_processing_status(uuid)','EXECUTE'),'service role can refresh media readiness');
select ok(to_regprocedure('public.get_media_access(uuid)') is not null,'get_media_access exists');
select ok(has_function_privilege('authenticated','public.get_media_access(uuid)','EXECUTE'),'authenticated can request protected media access');
select ok((select relrowsecurity from pg_class where oid='public.media_access_logs'::regclass),'media access logs RLS enabled');
select ok(to_regprocedure('public.can_view_post(uuid,uuid)') is not null,'two-argument can_view_post exists');
select ok(to_regprocedure('public.can_view_post(uuid)') is not null,'one-argument can_view_post exists');

do $$
declare
  creator uuid := '73000000-0000-0000-0000-000000000001';
  viewer uuid := '73000000-0000-0000-0000-000000000002';
  channel_id uuid;
  post_public uuid;
  asset_id uuid;
  refresh_status text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (creator,'authenticated','authenticated','phase8-creator@example.test','test','{"handle":"phase8_creator"}'::jsonb),
    (viewer,'authenticated','authenticated','phase8-viewer@example.test','test','{"handle":"phase8_viewer"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles set status='active',age_verified_at=now() where id in (creator,viewer);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_by,reviewed_at)
  values
    (creator,'manual','approved','phase8-test-creator',creator,now()),
    (viewer,'manual','approved','phase8-test-viewer',creator,now());

  insert into public.creator_terms_acceptances(user_id,version,source,declarations)
  values(creator,'1.0.0','phase8-test','{"identity":true,"consent":true,"rights":true}'::jsonb);

  insert into public.legal_acceptances(user_id,document_type,version)
  values
    (creator,'terms','1.0'),
    (creator,'privacy','1.0'),
    (creator,'content_prohibited','1.0'),
    (viewer,'terms','1.0'),
    (viewer,'privacy','1.0');

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
  )::text,true);

  set local role service_role;
  channel_id := public.create_creator_channel('phase8_channel','Phase 8 Creator','Media security test');
  set local role postgres;

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
  )::text,true);

  post_public := public.create_post(channel_id,'Phase 8 public','public',null,null,false,null);

  asset_id := gen_random_uuid();

  perform set_config('app.internal_write','on',true);

  insert into public.media_assets(
    id,post_id,channel_id,kind,storage_path,storage_provider,
    scan_status,integrity_status,processing_status,moderation_status,
    watermark_enabled,metadata,streamtape_status,streamtape_attempts
  )
  values(
    asset_id,post_public,channel_id,'video','phase8-test/'||asset_id::text||'.mp4','backblaze_b2',
    'clean','verified','ready','clean',
    true,'{}'::jsonb,'ready',0
  );

  perform set_config('app.phase8_asset_id',asset_id::text,false);
  perform set_config('app.phase8_creator',creator::text,false);
  perform set_config('app.phase8_viewer',viewer::text,false);
  perform set_config('app.phase8_post_public',post_public::text,false);
end $$;

reset role;

update public.media_assets
set processing_status='ready',
    thumb_blur_path=null,
    watermark_path=null,
    hls_path=null,
    streamtape_status='ready'
where id=current_setting('app.phase8_asset_id')::uuid;

set local role service_role;
select is(
  public.refresh_media_processing_status(current_setting('app.phase8_asset_id')::uuid),
  'processing',
  'video with missing derivatives cannot be marked ready'
);

update public.media_assets
set thumb_blur_path='phase8-test/derivatives/thumb.webp',
    watermark_path='phase8-test/derivatives/watermark.webp',
    hls_path='phase8-test/derivatives/index.m3u8',
    streamtape_status='ready',
    processing_status='processing'
where id=current_setting('app.phase8_asset_id')::uuid;

select is(
  public.refresh_media_processing_status(current_setting('app.phase8_asset_id')::uuid),
  'ready',
  'video becomes ready only after derivatives and Streamtape readiness'
);

update public.media_assets
set thumb_blur_path=null,
    watermark_path=null,
    hls_path=null,
    processing_status='ready',
    streamtape_status='ready'
where id=current_setting('app.phase8_asset_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.phase8_viewer'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.phase8_viewer'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select throws_ok(
  $$ select public.get_media_access(current_setting('app.phase8_asset_id')::uuid) $$,
  'media_forbidden',
  'viewer is denied media access while derivatives are incomplete'
);

select ok(
  not public.can_view_post(current_setting('app.phase8_post_public')::uuid,current_setting('app.phase8_viewer')::uuid),
  'viewer cannot view public post while video is not processing-ready'
);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.phase8_creator'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.phase8_creator'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  public.can_view_post(current_setting('app.phase8_post_public')::uuid,current_setting('app.phase8_creator')::uuid),
  'owner access remains available through the owner path'
);

set local role service_role;

update public.media_assets
set thumb_blur_path='phase8-test/derivatives/thumb.webp',
    watermark_path='phase8-test/derivatives/watermark.webp',
    hls_path='phase8-test/derivatives/index.m3u8',
    processing_status='ready',
    streamtape_status='ready'
where id=current_setting('app.phase8_asset_id')::uuid;

select is(
  public.refresh_media_processing_status(current_setting('app.phase8_asset_id')::uuid),
  'ready',
  'complete derivative set is accepted'
);

select ok(
  public.can_view_post(current_setting('app.phase8_post_public')::uuid,current_setting('app.phase8_creator')::uuid),
  'owner can still view after complete derivative readiness'
);

reset role;
select * from finish();
rollback;