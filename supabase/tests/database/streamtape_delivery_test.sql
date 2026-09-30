begin;

select plan(10);

select ok(
  to_regclass('public.media_assets') is not null,
  'media assets table exists'
);

select ok(
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='media_assets' and column_name='streamtape_file_id'
  ),
  'Streamtape file id contract exists'
);

select ok(
  to_regprocedure('public.can_view_post(uuid,uuid)') is not null,
  'Streamtape access gate RPC exists'
);

do $$
declare
  creator uuid:='51000000-0000-0000-0000-000000000001';
  client uuid:='51000000-0000-0000-0000-000000000002';
  channel_id uuid;
  post_id uuid;
  asset_id uuid;
  tier_id uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (creator,'authenticated','authenticated','streamtape-creator@example.test','test','{"handle":"streamtape_creator"}'::jsonb),
    (client,'authenticated','authenticated','streamtape-client@example.test','test','{"handle":"streamtape_client"}'::jsonb);

  perform set_config('app.internal_write','on',true);

  update public.profiles
  set status='active',age_verified_at=now()
  where id in (creator,client);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_at)
  values
    (creator,'native-test','approved','streamtape:'||creator::text,now()),
    (client,'native-test','approved','streamtape:'||client::text,now())
  on conflict (user_id) do update
  set status='approved',provider='native-test',provider_ref='streamtape:'||excluded.user_id::text,reviewed_at=now();

  insert into public.creator_terms_acceptances(user_id,version,source,declarations)
  values(
    creator,'1.0.0','native-test',
    jsonb_build_object('identity',true,'consent',true,'rights',true)
  )
  on conflict do nothing;

  insert into public.legal_acceptances(user_id,document_type,version)
  values
    (creator,'terms','1.0'),
    (creator,'privacy','1.0'),
    (creator,'content_prohibited','1.0'),
    (client,'terms','1.0'),
    (client,'privacy','1.0')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
  )::text,true);

  channel_id:=public.create_creator_channel(
    'streamtape_test_channel',
    'Streamtape Test Creator',
    'Native Streamtape delivery test'
  );

  post_id:=public.create_post(
    channel_id,
    'Streamtape delivery test',
    'public',
    null,
    null,
    false,
    null
  );

  select (public.create_media_upload(
    post_id,
    'video',
    'video/mp4',
    1024,
    repeat('a',64),
    'streamtape-test.mp4',
    true
  )->>'assetId')::uuid into asset_id;

  perform set_config('app.internal_write','on',true);
  update public.media_assets
  set storage_provider='backblaze_b2',
      integrity_status='verified',
      moderation_status='clean',
      scan_status='clean',
      processing_status='ready',
      streamtape_status='ready',
      streamtape_upload_id='test-upload',
      streamtape_file_id='test-file',
      ready_at=now()
  where id=asset_id;

  update public.posts
  set status='published',publish_at=now(),moderation_status='clean'
  where id=post_id;

  insert into public.subscription_tiers(channel_id,name,rank,price_month)
  values(channel_id,'Streamtape Test Tier',1,100)
  returning id into tier_id;

  perform set_config('app.streamtape_post_id',post_id::text,false);
  perform set_config('app.streamtape_asset_id',asset_id::text,false);
  perform set_config('app.streamtape_channel_id',channel_id::text,false);
  perform set_config('app.streamtape_client_id',client::text,false);
  perform set_config('app.streamtape_tier_id',tier_id::text,false);
end $$;

set local role authenticated;

select set_config('request.jwt.claim.sub',current_setting('app.streamtape_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.streamtape_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  public.can_view_post(current_setting('app.streamtape_post_id')::uuid,current_setting('app.streamtape_client_id')::uuid),
  'approved KYC client can view a ready public Streamtape video'
);

update public.kyc_verifications
set status='pending',updated_at=now()
where user_id=current_setting('app.streamtape_client_id')::uuid;

select ok(
  not public.can_view_post(current_setting('app.streamtape_post_id')::uuid,current_setting('app.streamtape_client_id')::uuid),
  'client without approved KYC cannot view the Streamtape video'
);

update public.kyc_verifications
set status='approved',updated_at=now()
where user_id=current_setting('app.streamtape_client_id')::uuid;

reset role;
select set_config('app.internal_write','on',true);
update public.posts
set visibility='subscribers'
where id=current_setting('app.streamtape_post_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.streamtape_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.streamtape_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  not public.can_view_post(current_setting('app.streamtape_post_id')::uuid,current_setting('app.streamtape_client_id')::uuid),
  'client without subscription cannot view a subscriber-only Streamtape video'
);

reset role;
select set_config('app.internal_write','on',true);
insert into public.subscriptions(
  subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,status
)
values(
  current_setting('app.streamtape_client_id')::uuid,
  current_setting('app.streamtape_channel_id')::uuid,
  current_setting('app.streamtape_tier_id')::uuid,
  1,
  100,
  now()+interval '30 days',
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.streamtape_client_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('app.streamtape_client_id'),
  'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text
)::text,true);

select ok(
  public.can_view_post(current_setting('app.streamtape_post_id')::uuid,current_setting('app.streamtape_client_id')::uuid),
  'subscribed client can view a subscriber-only Streamtape video'
);

select ok(
  (public.get_media_access(current_setting('app.streamtape_asset_id')::uuid)->>'streamtape_status')='ready'
  and (public.get_media_access(current_setting('app.streamtape_asset_id')::uuid)->>'streamtape_file_id')='test-file',
  'media access returns the Streamtape-ready state and file id after authorization'
);

select ok(
  exists(
    select 1 from public.media_access_logs
    where asset_id=current_setting('app.streamtape_asset_id')::uuid
      and user_id=current_setting('app.streamtape_client_id')::uuid
      and granted=true
  ),
  'authorized media access is audited'
);

reset role;
select * from finish();
rollback;
