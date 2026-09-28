-- Phase 5 hardening: compliance archive, server-side SHA-256, and archive jobs
--
-- The compliance archive is private and never exposed to the client. The archive
-- is produced by the Edge Function worker after an upload is finalized and its
-- integrity has been verified server-side.

alter table public.media_assets
  alter column sha256 drop not null;

alter table public.media_uploads
  alter column expected_sha256 drop not null;

alter table public.media_uploads
  drop constraint if exists media_uploads_expected_sha256_check;

alter table public.media_uploads
  add constraint media_uploads_expected_sha256_check
  check (
    expected_sha256 is null
    or expected_sha256 ~ '^[0-9a-f]{64}$'
  );

create table if not exists public.compliance_objects (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid unique references public.media_assets(id) on delete set null,
  source_post_id uuid references public.posts(id) on delete set null,
  bucket_id text not null default 'compliance-archive',
  archive_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'archived'
    check (status in ('pending','archived','retention_hold','deleted','failed')),
  retained_until timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists compliance_objects_retention_idx
  on public.compliance_objects(status, retained_until);

alter table public.compliance_objects enable row level security;

drop policy if exists compliance_objects_admin_read on public.compliance_objects;
create policy compliance_objects_admin_read
on public.compliance_objects
for select
to authenticated
using (
  public.has_permission(auth.uid(),'admin.compliance')
  or public.has_permission(auth.uid(),'admin.audit')
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'compliance-archive',
  'compliance-archive',
  false,
  1073741824,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=1073741824,
    allowed_mime_types=excluded.allowed_mime_types;

alter table public.content_archive_events
  drop constraint if exists content_archive_events_event_type_check;

alter table public.content_archive_events
  add constraint content_archive_events_event_type_check
  check (
    event_type = any(array[
      'uploaded',
      'removed',
      'flagged',
      'restored',
      'published',
      'legal_hold',
      'deleted'
    ])
  );

revoke execute on function public.archive_media_event(uuid,text,text)
  from public, anon, authenticated;

grant execute on function public.archive_media_event(uuid,text,text)
  to service_role;

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
  asset_id uuid:=gen_random_uuid();
  upload_id uuid:=gen_random_uuid();
  safe_name text:=public._content_name(_original_filename);
  storage_path text;
  channel_owner uuid;
  size_limit bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select * into p
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

  if _sha256 is not null and _sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_sha256';
  end if;

  if _kind not in ('image','video','audio') then
    raise exception 'invalid_media_kind';
  end if;

  if nullif(trim(_mime_type),'') is null then
    raise exception 'mime_type_required';
  end if;

  if _kind='image' then
    size_limit:=52428800;
    if _mime_type not in ('image/jpeg','image/png','image/webp','image/gif') then
      raise exception 'unsupported_image_type';
    end if;
  elsif _kind='video' then
    size_limit:=1073741824;
    if _mime_type not in ('video/mp4','video/webm','video/quicktime') then
      raise exception 'unsupported_video_type';
    end if;
  else
    size_limit:=209715200;
    if _mime_type not in ('audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac') then
      raise exception 'unsupported_audio_type';
    end if;
  end if;

  if _file_size>size_limit then raise exception 'file_too_large'; end if;
  if safe_name is null or safe_name='' then safe_name:='file'; end if;

  storage_path:=auth.uid()::text||'/media/'||asset_id::text||'/original/'||safe_name;

  insert into public.media_assets(
    id,
    post_id,
    channel_id,
    kind,
    storage_path,
    sha256,
    scan_status,
    mime_type,
    original_filename,
    file_size_bytes,
    client_sha256,
    integrity_status,
    processing_status,
    moderation_status,
    watermark_text,
    watermark_enabled,
    metadata
  )
  values(
    asset_id,
    p.id,
    p.channel_id,
    _kind,
    storage_path,
    nullif(lower(_sha256),''),
    'pending',
    _mime_type,
    safe_name,
    _file_size,
    nullif(lower(_sha256),''),
    'pending',
    'pending',
    'pending',
    '@'||(select handle::text from public.profiles where id=auth.uid())||' • '||left(asset_id::text,8),
    coalesce(p.watermark_enabled,true),
    '{}'::jsonb
  );

  insert into public.media_uploads(
    id,
    asset_id,
    user_id,
    bucket_id,
    storage_path,
    expected_size_bytes,
    expected_sha256,
    mime_type,
    original_filename,
    status,
    expires_at
  )
  values(
    upload_id,
    asset_id,
    auth.uid(),
    'prively-private',
    storage_path,
    _file_size,
    nullif(lower(_sha256),''),
    _mime_type,
    safe_name,
    'initiated',
    now()+interval '2 hours'
  );

  insert into public.media_consents(asset_id,user_id,consent_type,document_version)
  values
    (asset_id,auth.uid(),'upload','1.0'),
    (asset_id,auth.uid(),'rights','1.0'),
    (asset_id,auth.uid(),'watermark','1.0')
  on conflict do nothing;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),
    auth.uid(),
    'media.upload.created',
    jsonb_build_object(
      'asset_id',asset_id,
      'post_id',p.id,
      'kind',_kind,
      'size',_file_size
    )
  );

  return jsonb_build_object(
    'uploadId',upload_id,
    'assetId',asset_id,
    'path',storage_path,
    'bucket','prively-private',
    'expiresAt',now()+interval '2 hours'
  );
end
$$;

grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text)
  to authenticated;

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
    set status='expired',
        failure_reason='upload_expired',
        updated_at=now()
    where id=u.id;
    raise exception 'upload_expired';
  end if;

  if _reported_sha256 is not null and _reported_sha256 !~ '^[0-9a-f]{64}$' then
    update public.media_uploads
    set status='failed',
        failure_reason='invalid_sha256',
        updated_at=now()
    where id=u.id;
    raise exception 'invalid_sha256';
  end if;

  if u.expected_sha256 is not null
     and _reported_sha256 is not null
     and lower(_reported_sha256)<>u.expected_sha256 then
    update public.media_uploads
    set status='failed',
        failure_reason='sha256_mismatch',
        updated_at=now()
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
    set status='failed',
        failure_reason='size_mismatch',
        updated_at=now()
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
  set client_sha256=coalesce(lower(_reported_sha256),client_sha256),
      integrity_status='pending',
      processing_status='queued',
      scan_status='pending',
      moderation_status='pending',
      ready_at=null
  where id=a.id;

  insert into public.media_processing_jobs(asset_id,job_type,processor,input)
  values
    (a.id,'integrity','prively',jsonb_build_object('storage_path',u.storage_path)),
    (a.id,'moderation',null,jsonb_build_object('requires_provider',true)),
    (a.id,'archive',null,jsonb_build_object('bucket','compliance-archive'))
  on conflict(asset_id,job_type) do update
  set status='queued',
      attempts=0,
      error_code=null,
      error_message=null,
      available_at=now(),
      started_at=null,
      finished_at=null;

  if a.kind in ('image','video') then
    insert into public.media_processing_jobs(asset_id,job_type,processor,input)
    values(
      a.id,
      'thumbnail',
      null,
      jsonb_build_object('mime_type',a.mime_type)
    )
    on conflict(asset_id,job_type) do update
    set status='queued',
        attempts=0,
        error_code=null,
        error_message=null,
        available_at=now(),
        started_at=null,
        finished_at=null;

    if a.watermark_enabled then
      insert into public.media_processing_jobs(asset_id,job_type,processor,input)
      values(
        a.id,
        'watermark',
        null,
        jsonb_build_object('watermark_text',a.watermark_text)
      )
      on conflict(asset_id,job_type) do update
      set status='queued',
          attempts=0,
          error_code=null,
          error_message=null,
          available_at=now(),
          started_at=null,
          finished_at=null;
    end if;
  end if;

  if a.kind='video' then
    insert into public.media_processing_jobs(asset_id,job_type,processor,input)
    values(
      a.id,
      'hls',
      null,
      jsonb_build_object('mime_type',a.mime_type)
    )
    on conflict(asset_id,job_type) do update
    set status='queued',
        attempts=0,
        error_code=null,
        error_message=null,
        available_at=now(),
        started_at=null,
        finished_at=null;
  end if;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),
    auth.uid(),
    'media.upload.finalized',
    jsonb_build_object(
      'asset_id',a.id,
      'upload_id',u.id
    )
  );

  return jsonb_build_object(
    'assetId',a.id,
    'status','queued'
  );
end
$$;

grant execute on function public.finalize_media_upload(uuid,text,bigint)
  to authenticated;

-- Existing uploads that were finalized before this hardening receive an archive job.
insert into public.media_processing_jobs(asset_id,job_type,processor,input)
select
  a.id,
  'archive',
  null,
  jsonb_build_object('bucket','compliance-archive')
from public.media_assets a
join public.media_uploads u on u.asset_id=a.id
where u.status='finalized'
on conflict(asset_id,job_type) do nothing;
