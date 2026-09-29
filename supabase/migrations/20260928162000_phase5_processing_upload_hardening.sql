-- Phase 5 hardening: resumable upload reuse, derived-media readiness, fail-closed publication

alter table public.media_assets
  add column if not exists watermark_path text;

create or replace function public.refresh_media_processing_status(_asset uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.media_assets;
  has_failed boolean:=false;
  has_active boolean:=false;
  missing_derivative boolean:=false;
  next_status text;
begin
  select *
  into a
  from public.media_assets
  where id=_asset
    and deleted_at is null
  for update;

  if not found then
    raise exception 'asset_not_found';
  end if;

  if a.integrity_status<>'verified'
     or a.moderation_status<>'clean'
     or a.scan_status<>'clean' then
    next_status:=case
      when a.integrity_status in ('mismatch','unverified')
        or a.moderation_status in ('flagged','review')
        or a.scan_status in ('flagged','error')
      then 'failed'
      else 'queued'
    end;

    update public.media_assets
    set processing_status=next_status,
        ready_at=null
    where id=a.id;

    return next_status;
  end if;

  select
    exists(
      select 1
      from public.media_processing_jobs j
      where j.asset_id=a.id
        and j.status in ('failed','blocked')
    ),
    exists(
      select 1
      from public.media_processing_jobs j
      where j.asset_id=a.id
        and j.status in ('queued','processing')
    )
  into has_failed,has_active;

  if has_failed then
    update public.media_assets
    set processing_status='failed',
        ready_at=null
    where id=a.id;
    return 'failed';
  end if;

  if has_active then
    update public.media_assets
    set processing_status='processing',
        ready_at=null
    where id=a.id;
    return 'processing';
  end if;

  missing_derivative:=
    (a.kind in ('image','video') and a.thumb_blur_path is null)
    or (a.kind='video' and a.hls_path is null)
    or (a.kind in ('image','video') and a.watermark_enabled and a.watermark_path is null);

  if missing_derivative then
    update public.media_assets
    set processing_status='processing',
        ready_at=null
    where id=a.id;
    return 'processing';
  end if;

  update public.media_assets
  set processing_status='ready',
      ready_at=coalesce(ready_at,now())
  where id=a.id;

  return 'ready';
end
$$;

revoke execute on function public.refresh_media_processing_status(uuid) from public,anon,authenticated;
grant execute on function public.refresh_media_processing_status(uuid) to service_role;

create or replace function public.create_media_upload(
  _post uuid,
  _kind text,
  _mime_type text,
  _file_size bigint,
  _sha256 text default null,
  _original_filename text default 'file'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.posts;
  existing_upload public.media_uploads;
  asset_id uuid:=gen_random_uuid();
  upload_id uuid:=gen_random_uuid();
  safe_name text:=public._content_name(_original_filename);
  storage_path text;
  channel_owner uuid;
  size_limit bigint;
  expires_at_value timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select *
  into p
  from public.posts
  where id=_post
  for update;

  if not found then raise exception 'post_not_found'; end if;

  select owner_id into channel_owner
  from public.channels
  where id=p.channel_id;

  if channel_owner<>auth.uid() then raise exception 'post_forbidden'; end if;
  if p.status not in ('draft','scheduled') then raise exception 'post_not_editable'; end if;

  if not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;

  if _file_size<=0 then raise exception 'invalid_file_size'; end if;
  if _sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_sha256'; end if;
  if _kind not in ('image','video','audio') then raise exception 'invalid_media_kind'; end if;
  if nullif(trim(_mime_type),'') is null then raise exception 'mime_type_required'; end if;

  if _kind='image' then
    size_limit:=52428800;
    if _mime_type not in ('image/jpeg','image/png','image/webp','image/gif') then
      raise exception 'unsupported_image_type';
    end if;
  elsif _kind='video' then
    size_limit:=104857600;
    if _mime_type not in ('video/mp4','video/webm','video/quicktime') then
      raise exception 'unsupported_video_type';
    end if;
  else
    size_limit:=104857600;
    if _mime_type not in ('audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac') then
      raise exception 'unsupported_audio_type';
    end if;
  end if;

  if _file_size>size_limit then raise exception 'file_too_large'; end if;

  if safe_name is null or safe_name='' then safe_name:='file'; end if;

  select u.*
  into existing_upload
  from public.media_uploads u
  join public.media_assets a on a.id=u.asset_id
  where u.user_id=auth.uid()
    and a.post_id=p.id
    and a.deleted_at is null
    and u.expected_sha256=lower(_sha256)
    and u.expected_size_bytes=_file_size
    and u.mime_type=_mime_type
    and u.status in ('initiated','uploading')
    and u.expires_at>now()
  order by u.created_at desc
  limit 1
  for update of u;

  if found then
    return jsonb_build_object(
      'uploadId',existing_upload.id,
      'assetId',existing_upload.asset_id,
      'path',existing_upload.storage_path,
      'bucket',existing_upload.bucket_id,
      'expiresAt',existing_upload.expires_at,
      'resumed',true
    );
  end if;

  storage_path:=auth.uid()::text||'/media/'||asset_id::text||'/original/'||safe_name;
  expires_at_value:=now()+interval '2 hours';

  insert into public.media_assets(
    id,post_id,channel_id,kind,storage_path,sha256,scan_status,mime_type,original_filename,
    file_size_bytes,client_sha256,integrity_status,processing_status,moderation_status,
    watermark_text,watermark_enabled,metadata
  )
  values(
    asset_id,p.id,p.channel_id,_kind,storage_path,lower(_sha256),'pending',_mime_type,safe_name,
    _file_size,lower(_sha256),'pending','pending','pending',
    '@'||(select handle::text from public.profiles where id=auth.uid())||' • '||left(asset_id::text,8),
    coalesce(p.watermark_enabled,true),'{}'::jsonb
  );

  insert into public.media_uploads(
    id,asset_id,user_id,bucket_id,storage_path,expected_size_bytes,expected_sha256,
    mime_type,original_filename,status,expires_at
  )
  values(
    upload_id,asset_id,auth.uid(),'prively-private',storage_path,_file_size,lower(_sha256),
    _mime_type,safe_name,'initiated',expires_at_value
  );

  insert into public.media_consents(asset_id,user_id,consent_type,document_version)
  values
    (asset_id,auth.uid(),'upload','1.0'),
    (asset_id,auth.uid(),'rights','1.0'),
    (asset_id,auth.uid(),'watermark','1.0')
  on conflict do nothing;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),auth.uid(),'media.upload.created',
    jsonb_build_object('asset_id',asset_id,'post_id',p.id,'kind',_kind,'size',_file_size)
  );

  return jsonb_build_object(
    'uploadId',upload_id,
    'assetId',asset_id,
    'path',storage_path,
    'bucket','prively-private',
    'expiresAt',expires_at_value,
    'resumed',false
  );
end
$$;

grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text) to authenticated;

create or replace function public.finalize_media_upload(
  _upload uuid,
  _reported_sha256 text,
  _file_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  u public.media_uploads;
  a public.media_assets;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select *
  into u
  from public.media_uploads
  where id=_upload
    and user_id=auth.uid()
  for update;

  if not found then raise exception 'upload_not_found'; end if;

  select *
  into a
  from public.media_assets
  where id=u.asset_id
  for update;

  if not found then raise exception 'asset_not_found'; end if;
  if u.expires_at<=now() then
    update public.media_uploads
    set status='expired',failure_reason='upload_expired',updated_at=now()
    where id=u.id;
    raise exception 'upload_expired';
  end if;

  if _reported_sha256 !~ '^[0-9a-f]{64}$'
     or lower(_reported_sha256)<>u.expected_sha256 then
    update public.media_uploads
    set status='failed',failure_reason='sha256_mismatch',updated_at=now()
    where id=u.id;

    update public.media_assets
    set integrity_status='mismatch',
        processing_status='failed',
        moderation_status='flagged',
        scan_status='flagged',
        ready_at=null
    where id=a.id;

    raise exception 'sha256_mismatch';
  end if;

  if _file_size<>u.expected_size_bytes then
    update public.media_uploads
    set status='failed',failure_reason='size_mismatch',updated_at=now()
    where id=u.id;

    update public.media_assets
    set integrity_status='mismatch',
        processing_status='failed',
        moderation_status='flagged',
        scan_status='flagged',
        ready_at=null
    where id=a.id;

    raise exception 'size_mismatch';
  end if;

  update public.media_uploads
  set status='finalized',
      uploaded_at=coalesce(uploaded_at,now()),
      finalized_at=now(),
      updated_at=now()
  where id=u.id;

  update public.media_assets
  set integrity_status='pending',
      processing_status='queued',
      scan_status='pending',
      moderation_status='pending',
      ready_at=null
  where id=a.id;

  insert into public.media_processing_jobs(asset_id,job_type,processor,input)
  values
    (a.id,'integrity','prively',jsonb_build_object('storage_path',u.storage_path)),
    (a.id,'moderation',null,jsonb_build_object('requires_provider',true))
  on conflict(asset_id,job_type) do nothing;

  if a.kind in ('image','video') then
    insert into public.media_processing_jobs(asset_id,job_type,processor,input)
    values
      (a.id,'thumbnail',null,jsonb_build_object('mime_type',a.mime_type)),
      (a.id,'watermark',null,jsonb_build_object('watermark_text',a.watermark_text))
    on conflict(asset_id,job_type) do nothing;
  end if;

  if a.kind='video' then
    insert into public.media_processing_jobs(asset_id,job_type,processor,input)
    values(a.id,'hls',null,jsonb_build_object('mime_type',a.mime_type))
    on conflict(asset_id,job_type) do nothing;
  end if;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),auth.uid(),'media.upload.finalized',
    jsonb_build_object('asset_id',a.id,'upload_id',u.id)
  );

  return jsonb_build_object('assetId',a.id,'status','queued');
end
$$;

grant execute on function public.finalize_media_upload(uuid,text,bigint) to authenticated;

create or replace function public.publish_post(_post uuid,_scheduled_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.posts;
  media_count integer;
  ready_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select p0.*
  into p
  from public.posts p0
  join public.channels c on c.id=p0.channel_id
  where p0.id=_post
    and c.owner_id=auth.uid()
  for update;

  if not found then raise exception 'post_not_found'; end if;
  if not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;

  select count(*) into media_count
  from public.media_assets
  where post_id=p.id
    and deleted_at is null;

  if media_count=0 then raise exception 'media_required'; end if;

  select count(*) into ready_count
  from public.media_assets
  where post_id=p.id
    and deleted_at is null
    and integrity_status='verified'
    and moderation_status='clean'
    and scan_status='clean'
    and processing_status='ready';

  if ready_count<>media_count then raise exception 'media_not_ready'; end if;

  perform set_config('app.internal_write','on',true);

  if _scheduled_at is not null and _scheduled_at>now() then
    update public.posts
    set status='scheduled',
        publish_at=_scheduled_at,
        moderation_status='clean',
        publication_reason='scheduled'
    where id=p.id;
  else
    update public.posts
    set status='published',
        publish_at=now(),
        moderation_status='clean',
        publication_reason='published'
    where id=p.id;
  end if;

  insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
  values(
    p.id,'restored',auth.uid(),'post_published',
    jsonb_build_object('visibility',p.visibility,'scheduled_at',_scheduled_at)
  );
end
$$;

grant execute on function public.publish_post(uuid,timestamptz) to authenticated;

create or replace function public.publish_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  published_count integer:=0;
  r record;
begin
  for r in
    select p.id
    from public.posts p
    where p.status='scheduled'
      and p.publish_at is not null
      and p.publish_at<=now()
      and p.moderation_status='clean'
      and not exists(
        select 1
        from public.media_assets a
        where a.post_id=p.id
          and a.deleted_at is null
          and (
            a.integrity_status<>'verified'
            or a.moderation_status<>'clean'
            or a.scan_status<>'clean'
            or a.processing_status<>'ready'
          )
      )
      and exists(
        select 1 from public.media_assets a
        where a.post_id=p.id and a.deleted_at is null
      )
    for update skip locked
  loop
    perform set_config('app.internal_write','on',true);
    update public.posts set status='published' where id=r.id;
    published_count:=published_count+1;
  end loop;

  return published_count;
end
$$;

revoke execute on function public.publish_scheduled_posts() from public,anon,authenticated;
grant execute on function public.publish_scheduled_posts() to service_role;

create or replace function public.get_creator_content(_channel uuid default null)
returns table(
  id uuid,
  channel_id uuid,
  caption text,
  visibility public.visibility,
  price bigint,
  status text,
  publish_at timestamptz,
  expires_at timestamptz,
  is_story boolean,
  moderation_status text,
  created_at timestamptz,
  media_count integer,
  ready_media_count integer
)
language sql
stable
security definer
set search_path=public
as $$
select
  p.id,
  p.channel_id,
  p.caption,
  p.visibility,
  p.price,
  p.status,
  p.publish_at,
  p.expires_at,
  p.is_story,
  p.moderation_status,
  p.created_at,
  (select count(*) from public.media_assets a where a.post_id=p.id and a.deleted_at is null)::integer,
  (select count(*)
   from public.media_assets a
   where a.post_id=p.id
     and a.deleted_at is null
     and a.integrity_status='verified'
     and a.moderation_status='clean'
     and a.scan_status='clean'
     and a.processing_status='ready')::integer
from public.posts p
join public.channels c on c.id=p.channel_id
where c.owner_id=auth.uid()
  and (_channel is null or p.channel_id=_channel)
order by p.created_at desc
limit 100
$$;

grant execute on function public.get_creator_content(uuid) to authenticated;

create or replace function public.requeue_media_job(_asset uuid,_job_type text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  j public.media_processing_jobs;
  result_status text;
begin
  select j0.*
  into j
  from public.media_processing_jobs j0
  join public.media_assets a on a.id=j0.asset_id
  where j0.asset_id=_asset
    and j0.job_type=_job_type
    and (
      public.is_creator_of_channel(auth.uid(),a.channel_id)
      or public.has_permission(auth.uid(),'admin.moderation')
    )
  for update;

  if not found then raise exception 'job_not_found'; end if;

  update public.media_processing_jobs
  set status='queued',
      attempts=0,
      error_code=null,
      error_message=null,
      available_at=now(),
      started_at=null,
      finished_at=null
  where id=j.id;

  perform set_config('app.internal_write','on',true);
  result_status:=public.refresh_media_processing_status(_asset);
  return j.id;
end
$$;

grant execute on function public.requeue_media_job(uuid,text) to authenticated;

create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  a public.media_assets;
  owner_ok boolean;
  admin_ok boolean;
  allowed boolean:=false;
  reason text:='forbidden';
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select * into a
  from public.media_assets
  where id=_asset
    and deleted_at is null;

  if not found then
    insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
    values(_asset,auth.uid(),'signed_url',false,'asset_not_found');
    raise exception 'media_forbidden';
  end if;

  owner_ok:=public.is_creator_of_channel(auth.uid(),a.channel_id);
  admin_ok:=public.has_permission(auth.uid(),'admin.moderation');

  if owner_ok then
    allowed:=true;
    reason:='owner';
  elsif admin_ok then
    allowed:=true;
    reason:='moderation_admin';
  elsif a.post_id is not null
        and public.can_view_post(a.post_id,auth.uid())
        and a.integrity_status='verified'
        and a.moderation_status='clean'
        and a.scan_status='clean'
        and a.processing_status='ready' then
    allowed:=true;
    reason:='post_access';
  end if;

  insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
  values(a.id,auth.uid(),'signed_url',allowed,reason);

  if not allowed then raise exception 'media_forbidden'; end if;

  return jsonb_build_object(
    'asset_id',a.id,
    'path',a.storage_path,
    'kind',a.kind,
    'hls_path',a.hls_path,
    'thumb_blur_path',a.thumb_blur_path,
    'watermark_path',a.watermark_path,
    'watermark_enabled',a.watermark_enabled,
    'watermark_text',a.watermark_text,
    'processing_status',a.processing_status,
    'expires_in',60
  );
end
$$;

grant execute on function public.get_media_access(uuid) to authenticated;

create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  p public.posts;
  c public.channels;
  media_count integer;
begin
  if auth.uid() is not null and _uid<>auth.uid() then return false; end if;

  select * into p
  from public.posts
  where id=_post_id
    and status='published'
    and (publish_at is null or publish_at<=now())
    and (expires_at is null or expires_at>now());

  if not found then return false; end if;

  select * into c from public.channels where id=p.channel_id;
  if _uid=c.owner_id then return true; end if;
  if not public.is_age_verified(_uid) then return false; end if;

  select count(*) into media_count
  from public.media_assets
  where post_id=p.id and deleted_at is null;

  if media_count=0 then return false; end if;

  if exists(
    select 1 from public.media_assets a
    where a.post_id=p.id
      and a.deleted_at is null
      and (
        a.integrity_status<>'verified'
        or a.moderation_status<>'clean'
        or a.scan_status<>'clean'
        or a.processing_status<>'ready'
      )
  ) then
    return false;
  end if;

  if exists(
    select 1 from public.blocks
    where (owner_id=c.owner_id and blocked_user_id=_uid)
       or (owner_id=_uid and blocked_user_id=c.owner_id)
  ) then return false; end if;

  if exists(select 1 from public.hidden_from where channel_id=c.id and user_id=_uid) then return false; end if;

  return case p.visibility
    when 'public' then true
    when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
      or exists(
        select 1
        from public.bundle_purchases bp
        join public.bundle_items bi on bi.bundle_id=bp.bundle_id
        where bp.buyer_id=_uid and bi.post_id=p.id
      )
    else false
  end;
end
$$;

grant execute on function public.can_view_post(uuid,uuid) to authenticated;

drop policy if exists prively_private_media_read on storage.objects;
create policy prively_private_media_read on storage.objects
for select to authenticated
using(
  bucket_id='prively-private'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists prively_private_media_admin_read on storage.objects;