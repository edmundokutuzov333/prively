begin;

select plan(23);

select ok(to_regclass('public.media_assets') is not null,'media_assets exists');
select ok(to_regclass('public.media_access_logs') is not null,'media_access_logs exists');
select ok((select relrowsecurity from pg_class where oid='public.media_access_logs'::regclass),'media_access_logs RLS enabled');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='media_access_logs' and policyname='media_access_own_read'),'media access own-read policy exists');
select ok(to_regprocedure('public.get_media_access(uuid)') is not null,'get_media_access exists');
select ok(prosecdef from pg_proc where oid='public.get_media_access(uuid)'::regprocedure,'get_media_access is SECURITY DEFINER');
select ok(position('search_path TO ''public'', ''pg_temp''' in pg_get_functiondef('public.get_media_access(uuid)'::regprocedure))>0,'get_media_access uses safe search_path');
select ok(position('public.can_view_post' in pg_get_functiondef('public.get_media_access(uuid)'::regprocedure))>0,'get_media_access delegates authorization to can_view_post');
select ok(position('processing_status' in pg_get_functiondef('public.get_media_access(uuid)'::regprocedure))>0,'get_media_access exposes processing state');
select ok(position('streamtape_status' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'can_view_post gates Streamtape state');
select ok(position('storage_provider=''backblaze_b2''' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'can_view_post gates B2 video delivery');
select ok(position('publish_at<=now()' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'can_view_post gates future publication');
select ok(position('expires_at>now()' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'can_view_post gates expired publication');
select ok(position('when ''public'' then true' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'public visibility branch exists');
select ok(position('when ''followers'' then' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'followers visibility branch exists');
select ok(position('when ''ppv'' then' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'PPV visibility branch exists');
select ok(position('if _uid=c.owner_id then return true' in pg_get_functiondef('public.can_view_post(uuid,uuid)'::regprocedure))>0,'owner bypass branch exists');

do $$
declare
  v_owner uuid := '74000000-0000-0000-0000-000000000001';
  v_viewer uuid := '74000000-0000-0000-0000-000000000002';
  v_channel uuid := gen_random_uuid();
  v_public uuid := gen_random_uuid();
  v_followers uuid := gen_random_uuid();
  v_ppv uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (v_owner,'authenticated','authenticated','phase8-test-owner@example.test','test','{}'::jsonb),
    (v_viewer,'authenticated','authenticated','phase8-test-viewer@example.test','test','{}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles set status='active',age_verified_at=now() where id in (v_owner,v_viewer);
  insert into public.user_roles(user_id,role) values(v_owner,'creator') on conflict do nothing;
  insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_by,reviewed_at)
  values(v_viewer,'manual','approved','phase8-pgtap',v_owner,now());

  insert into public.channels(id,owner_id,handle,display_name,bio,is_seed)
  values(v_channel,v_owner,'phase8_test_channel','Phase 8 Test','Temporary transactional fixture',true);

  insert into public.posts(id,channel_id,caption,visibility,status,publish_at,moderation_status,watermark_enabled)
  values
    (v_public,v_channel,'phase8 public','public','published',now(),'clean',false),
    (v_followers,v_channel,'phase8 followers','followers','published',now(),'clean',false),
    (v_ppv,v_channel,'phase8 ppv','ppv','published',now(),'clean',false);

  update public.posts set price=1000 where id=v_ppv;

  insert into public.media_assets(post_id,channel_id,kind,storage_path,sha256,scan_status,integrity_status,processing_status,moderation_status,watermark_enabled,storage_provider)
  values
    (v_public,v_channel,'image','phase8-test/'||v_public::text,repeat('a',64),'clean','verified','ready','clean',false,'backblaze_b2'),
    (v_followers,v_channel,'image','phase8-test/'||v_followers::text,repeat('b',64),'clean','verified','ready','clean',false,'backblaze_b2'),
    (v_ppv,v_channel,'image','phase8-test/'||v_ppv::text,repeat('c',64),'clean','verified','ready','clean',false,'backblaze_b2');

  insert into public.follows(follower_id,channel_id) values(v_viewer,v_channel);
  insert into public.ppv_purchases(buyer_id,post_id,price_paid,txn_id) values(v_viewer,v_ppv,1000,gen_random_uuid());

  perform set_config('request.jwt.claim.sub',v_viewer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',v_viewer::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text)::text,true);

  perform set_config('app.phase8_public',public.can_view_post(v_public,v_viewer)::text,false);
  perform set_config('app.phase8_followers',public.can_view_post(v_followers,v_viewer)::text,false);
  perform set_config('app.phase8_ppv',public.can_view_post(v_ppv,v_viewer)::text,false);

  delete from public.follows f where f.follower_id=v_viewer and f.channel_id=v_channel;
  perform set_config('app.phase8_followers_after',public.can_view_post(v_followers,v_viewer)::text,false);

  delete from public.ppv_purchases p where p.buyer_id=v_viewer and p.post_id=v_ppv;
  perform set_config('app.phase8_ppv_after',public.can_view_post(v_ppv,v_viewer)::text,false);

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',v_owner::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text)::text,true);
  perform set_config('app.phase8_owner',public.can_view_post(v_public,v_owner)::text,false);
end $$;

select is(current_setting('app.phase8_public'),'true','public viewer access is granted');
select is(current_setting('app.phase8_followers'),'true','followers access is granted with follow');
select is(current_setting('app.phase8_followers_after'),'false','followers access is denied without follow');
select is(current_setting('app.phase8_ppv'),'true','PPV access is granted with purchase');
select is(current_setting('app.phase8_ppv_after'),'false','PPV access is denied without purchase');
select is(current_setting('app.phase8_owner'),'true','owner access is granted');

select * from finish();
rollback;