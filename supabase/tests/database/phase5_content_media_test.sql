begin;

select plan(17);

select ok(to_regclass('public.media_uploads') is not null,'media uploads exists');
select ok(to_regclass('public.media_processing_jobs') is not null,'media jobs exists');
select ok(to_regclass('public.media_consents') is not null,'media consents exists');
select ok(to_regclass('public.moderation_scans') is not null,'moderation scans exists');
select ok(to_regclass('public.media_access_logs') is not null,'media access logs exists');
select ok(to_regclass('public.content_archive_events') is not null,'content archive exists');
select ok((select relrowsecurity from pg_class where oid='public.media_uploads'::regclass),'media uploads RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.media_processing_jobs'::regclass),'media jobs RLS enabled');
select ok(not has_function_privilege('anon','public.create_post(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz)','EXECUTE'),'anon cannot create posts');
select ok(not has_function_privilege('anon','public.create_media_upload(uuid,text,text,bigint,text,text)','EXECUTE'),'anon cannot create media uploads');
select ok(not has_function_privilege('anon','public.publish_post(uuid,timestamptz)','EXECUTE'),'anon cannot publish posts');
select ok(to_regprocedure('public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text)') is not null,'blurhash post creator exists');
select ok(not has_function_privilege('anon','public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text)','EXECUTE'),'anon cannot create blurhash posts');

do $$
declare
  creator uuid:='50000000-0000-0000-0000-000000000001';
  client uuid:='50000000-0000-0000-0000-000000000002';
  channel_id uuid;
  post_id uuid;
  asset jsonb;
  v_asset_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (creator,'authenticated','authenticated','phase5-creator@example.test','test','{"handle":"phase5_creator"}'::jsonb),
    (client,'authenticated','authenticated','phase5-client@example.test','test','{"handle":"phase5_client"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles
  set status='active',age_verified_at=now()
  where id in (creator,client);

  insert into public.user_roles(user_id,role) values(creator,'creator') on conflict do nothing;

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

  channel_id:=public.create_creator_channel('phase5_channel','Phase 5 Creator','Content engine test');
  post_id:=public.create_post(channel_id,'Phase 5 draft','public',null,null,false,null);
  asset:=public.create_media_upload(
    post_id,'image','image/png',2048,
    repeat('a',64),'test.png'
  );

  v_asset_id:=(asset->>'assetId')::uuid;
  perform set_config('app.phase5_asset_id',v_asset_id::text,true);
  perform set_config('app.phase5_post_id',post_id::text,true);
  if not exists(select 1 from public.media_uploads where id=(asset->>'uploadId')::uuid and user_id=creator) then
    raise exception 'media upload session missing';
  end if;

  if not exists(select 1 from public.media_consents where media_consents.asset_id=v_asset_id and consent_type='rights') then
    raise exception 'media rights consent missing';
  end if;

  perform set_config('app.internal_write','on',true);
  update public.media_assets
  set integrity_status='pending',moderation_status='pending',scan_status='pending'
  where public.media_assets.id=v_asset_id;
  update public.posts set status='published',publish_at=now() where id=post_id;
end $$;

set local role authenticated;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','50000000-0000-0000-0000-000000000002',
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  not public.can_view_post(
    (select id from public.posts where channel_id=(select id from public.channels where handle='phase5_channel')),
    auth.uid()
  ),
  'client cannot view media-backed post before integrity and moderation approval'
);

do $$
declare
  v_asset_id uuid;
  v_post_id uuid;
begin
  select a.id,a.post_id into v_asset_id,v_post_id
  from public.media_assets a
  where a.original_filename='test.png'
  limit 1;

  perform set_config('app.internal_write','on',true);
  update public.media_assets
  set integrity_status='verified',moderation_status='clean',scan_status='clean',ready_at=now()
  where public.media_assets.id=v_asset_id;
  update public.posts set moderation_status='clean' where public.posts.id=v_post_id;
end $$;

select ok(
  public.can_view_post(
    (select id from public.posts where caption='Phase 5 draft'),
    auth.uid()
  ),
  'client can view a fully approved published post'
);

select ok(
  (public.get_media_access(current_setting('app.phase5_asset_id')::uuid) ->> 'watermark_enabled')::boolean,
  'media access returns watermark policy'
);

select is(
  (select count(*) from public.media_access_logs where user_id=auth.uid() and granted),
  1::bigint,
  'media access is audited'
);

reset role;
select * from finish();
rollback;