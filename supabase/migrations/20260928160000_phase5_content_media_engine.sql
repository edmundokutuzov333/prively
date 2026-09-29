-- Phase 5: Content Engine & Media Infrastructure

alter table public.posts
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists publication_reason text,
  add column if not exists watermark_enabled boolean not null default true;

alter table public.posts
  drop constraint if exists posts_moderation_status_check;
alter table public.posts
  add constraint posts_moderation_status_check
  check (moderation_status in ('pending','clean','flagged','review'));

alter table public.media_assets
  add column if not exists mime_type text,
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists duration_ms bigint,
  add column if not exists client_sha256 text,
  add column if not exists integrity_status text not null default 'pending',
  add column if not exists processing_status text not null default 'pending',
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists watermark_text text,
  add column if not exists watermark_enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists ready_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.media_assets
  drop constraint if exists media_assets_integrity_status_check;
alter table public.media_assets
  add constraint media_assets_integrity_status_check
  check (integrity_status in ('pending','verified','mismatch','unverified'));

alter table public.media_assets
  drop constraint if exists media_assets_processing_status_check;
alter table public.media_assets
  add constraint media_assets_processing_status_check
  check (processing_status in ('pending','queued','processing','ready','failed','blocked'));

alter table public.media_assets
  drop constraint if exists media_assets_moderation_status_check;
alter table public.media_assets
  add constraint media_assets_moderation_status_check
  check (moderation_status in ('pending','clean','flagged','review'));

create table if not exists public.media_uploads(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'prively-private',
  storage_path text not null unique,
  expected_size_bytes bigint not null check(expected_size_bytes > 0),
  expected_sha256 text not null check(expected_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null,
  original_filename text not null,
  status text not null default 'initiated' check(status in ('initiated','uploading','uploaded','finalized','failed','expired')),
  expires_at timestamptz not null,
  started_at timestamptz,
  uploaded_at timestamptz,
  finalized_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_uploads_user_idx on public.media_uploads(user_id,created_at desc);
create index if not exists media_uploads_status_idx on public.media_uploads(status,expires_at);

create table if not exists public.media_consents(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check(consent_type in ('upload','rights','watermark')),
  document_version text not null,
  consented_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(asset_id,user_id,consent_type,document_version)
);
create index if not exists media_consents_asset_idx on public.media_consents(asset_id);

create table if not exists public.media_processing_jobs(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  job_type text not null check(job_type in ('integrity','thumbnail','hls','watermark','moderation','archive')),
  status text not null default 'queued' check(status in ('queued','processing','succeeded','failed','blocked')),
  attempts integer not null default 0 check(attempts >= 0),
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  processor text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(asset_id,job_type)
);
create index if not exists media_processing_jobs_queue_idx
  on public.media_processing_jobs(status,available_at,created_at);

create table if not exists public.moderation_scans(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  provider text not null,
  provider_ref text,
  status text not null check(status in ('pending','clean','flagged','review','error')),
  categories jsonb not null default '{}'::jsonb,
  score numeric(6,5),
  raw_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists moderation_scans_asset_idx on public.moderation_scans(asset_id,created_at desc);

create table if not exists public.media_access_logs(
  id bigint generated always as identity primary key,
  asset_id uuid references public.media_assets(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('signed_url','metadata','thumbnail','hls','download')),
  granted boolean not null,
  reason text,
  user_agent_hash text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists media_access_logs_asset_idx on public.media_access_logs(asset_id,created_at desc);
create index if not exists media_access_logs_user_idx on public.media_access_logs(user_id,created_at desc);

create table if not exists public.content_archive_events(
  id bigint generated always as identity primary key,
  post_id uuid references public.posts(id) on delete set null,
  asset_id uuid references public.media_assets(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check(event_type in ('removed','flagged','restored','legal_hold','deleted')),
  reason text,
  storage_path text,
  sha256 text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_archive_post_idx on public.content_archive_events(post_id,created_at desc);
create index if not exists content_archive_asset_idx on public.content_archive_events(asset_id,created_at desc);

create table if not exists public.watermark_policies(
  id uuid primary key default gen_random_uuid(),
  scope text not null check(scope in ('platform','channel','post')),
  scope_id uuid,
  enabled boolean not null default true,
  mode text not null default 'overlay' check(mode in ('overlay','embedded')),
  template text not null default '@{{handle}} • {{asset}}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope,scope_id)
);

alter table public.posts enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_uploads enable row level security;
alter table public.media_consents enable row level security;
alter table public.media_processing_jobs enable row level security;
alter table public.moderation_scans enable row level security;
alter table public.media_access_logs enable row level security;
alter table public.content_archive_events enable row level security;
alter table public.watermark_policies enable row level security;

drop policy if exists posts_read on public.posts;
drop policy if exists posts_visible on public.posts;
create policy posts_visible on public.posts
for select to authenticated
using(
  public.is_creator_of_channel(auth.uid(),channel_id)
  or public.can_view_post(id,auth.uid())
);

drop policy if exists media_owner on public.media_assets;
drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets
for select to authenticated
using(
  public.is_creator_of_channel(auth.uid(),channel_id)
  or exists(
    select 1 from public.posts p
    where p.id=media_assets.post_id and public.can_view_post(p.id,auth.uid())
  )
);

drop policy if exists media_uploads_owner_read on public.media_uploads;
create policy media_uploads_owner_read on public.media_uploads
for select to authenticated using(user_id=auth.uid());

drop policy if exists media_consents_owner_read on public.media_consents;
create policy media_consents_owner_read on public.media_consents
for select to authenticated using(user_id=auth.uid());

drop policy if exists media_jobs_admin_read on public.media_processing_jobs;
create policy media_jobs_admin_read on public.media_processing_jobs
for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists moderation_scans_owner_read on public.moderation_scans;
create policy moderation_scans_owner_read on public.moderation_scans
for select to authenticated using(
  exists(select 1 from public.media_assets a where a.id=asset_id and public.is_creator_of_channel(auth.uid(),a.channel_id))
  or public.has_permission(auth.uid(),'admin.moderation')
);

drop policy if exists media_access_own_read on public.media_access_logs;
create policy media_access_own_read on public.media_access_logs
for select to authenticated using(user_id=auth.uid() or public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists archive_admin_read on public.content_archive_events;
create policy archive_admin_read on public.content_archive_events
for select to authenticated using(
  public.has_permission(auth.uid(),'admin.audit')
  or public.has_permission(auth.uid(),'admin.compliance')
);

drop policy if exists watermark_policy_admin_read on public.watermark_policies;
create policy watermark_policy_admin_read on public.watermark_policies
for select to authenticated using(
  public.has_permission(auth.uid(),'admin.config')
  or public.is_creator_of_channel(auth.uid(),scope_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'prively-private',
  'prively-private',
  false,
  1073741824,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac'
  ]
)
on conflict(id) do update
set public=false,file_size_limit=1073741824,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists prively_private_owner_read on storage.objects;
drop policy if exists prively_private_owner_write on storage.objects;
drop policy if exists prively_private_owner_delete on storage.objects;
drop policy if exists prively_private_owner_update on storage.objects;
drop policy if exists prively_private_media_insert on storage.objects;
drop policy if exists prively_private_media_read on storage.objects;
drop policy if exists prively_private_media_delete on storage.objects;
create policy prively_private_media_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='prively-private'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(
    select 1 from public.media_uploads u
    where u.user_id=auth.uid()
      and u.bucket_id=bucket_id
      and u.storage_path=name
      and u.expires_at>now()
      and u.status in ('initiated','uploading')
  )
);
create policy prively_private_media_read on storage.objects
for select to authenticated
using(
  bucket_id='prively-private'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_permission(auth.uid(),'admin.control_room')
  )
);
create policy prively_private_media_delete on storage.objects
for delete to authenticated
using(
  bucket_id='prively-private'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_permission(auth.uid(),'admin.control_room')
  )
);

create or replace function public._content_name(_name text)
returns text language sql immutable
as $$
select left(regexp_replace(coalesce(_name,'file'),'[^A-Za-z0-9._-]','_','g'),120)
$$;

create or replace function public.create_creator_channel(
  _handle text,
  _display_name text,
  _bio text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare channel_id uuid:=gen_random_uuid();
declare normalized_handle citext:=lower(trim(_handle));
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator') or not public.is_age_verified(auth.uid()) then
    raise exception 'creator_verification_required';
  end if;
  if normalized_handle !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_channel_handle'; end if;
  if nullif(trim(_display_name),'') is null then raise exception 'display_name_required'; end if;
  if exists(select 1 from public.channels where handle=normalized_handle) then raise exception 'channel_handle_taken'; end if;
  insert into public.channels(id,owner_id,handle,display_name,bio)
  values(channel_id,auth.uid(),normalized_handle,trim(_display_name),nullif(trim(_bio),''));
  return channel_id;
end
$$;

create or replace function public.create_post(
  _channel uuid,
  _caption text default null,
  _visibility public.visibility default 'subscribers',
  _min_tier_rank smallint default null,
  _price bigint default null,
  _is_story boolean default false,
  _expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare post_id uuid:=gen_random_uuid();
declare channel_owner uuid;
declare expiry timestamptz:=_expires_at;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select owner_id into channel_owner from public.channels where id=_channel;
  if channel_owner is null or channel_owner<>auth.uid() then raise exception 'channel_forbidden'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'creator_verification_required'; end if;
  if not public.has_legal_acceptance(auth.uid(),'terms','1.0')
     or not public.has_legal_acceptance(auth.uid(),'privacy','1.0')
     or not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;
  if _visibility='ppv' and coalesce(_price,0)<=0 then raise exception 'ppv_price_required'; end if;
  if _visibility='tier' and coalesce(_min_tier_rank,0) not between 1 and 4 then raise exception 'tier_required'; end if;
  if _visibility<>'ppv' and _price is not null then raise exception 'price_visibility_mismatch'; end if;
  if _is_story and expiry is null then expiry:=now()+interval '24 hours'; end if;
  if _is_story and expiry<=now() then raise exception 'story_expiry_invalid'; end if;
  if length(coalesce(_caption,''))>5000 then raise exception 'caption_too_long'; end if;
  insert into public.posts(id,channel_id,caption,visibility,min_tier_rank,price,status,publish_at,expires_at,is_story,moderation_status)
  values(post_id,_channel,nullif(trim(_caption),''),_visibility,_min_tier_rank,_price,'draft',null,expiry,_is_story,'pending');
  return post_id;
end
$$;

CREATE OR REPLACE FUNCTION public.create_media_upload(_post uuid, _kind text, _mime_type text, _file_size bigint, _sha256 text DEFAULT NULL::text, _original_filename text DEFAULT 'file'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing_upload public.media_uploads;
  existing_asset public.media_assets;
  p public.posts;
  asset_id uuid:=gen_random_uuid();
  upload_id uuid:=gen_random_uuid();
  safe_name text:=public._content_name(_original_filename);
  storage_path text;
  channel_owner uuid;
  size_limit bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  if _sha256 is not null then
    select u.*
    into existing_upload
    from public.media_uploads u
    join public.media_assets a on a.id=u.asset_id
    where u.user_id=auth.uid()
      and a.post_id=_post
      and u.status in ('initiated','uploading')
      and u.expires_at>now()
      and u.expected_size_bytes=_file_size
      and u.expected_sha256=lower(_sha256)
      and u.mime_type=_mime_type
    order by u.created_at desc
    limit 1
    for update;

    if found then
      return jsonb_build_object(
        'uploadId',existing_upload.id,
        'assetId',existing_upload.asset_id,
        'path',existing_upload.storage_path,
        'bucket',existing_upload.bucket_id,
        'expiresAt',existing_upload.expires_at
      );
    end if;
  end if;

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
$function$;

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
declare u public.media_uploads;
declare a public.media_assets;
declare object_size bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into u from public.media_uploads where id=_upload and user_id=auth.uid() for update;
  if not found then raise exception 'upload_not_found'; end if;
  select * into a from public.media_assets where id=u.asset_id for update;
  if not found then raise exception 'asset_not_found'; end if;
  if _reported_sha256 !~ '^[0-9a-f]{64}$' or lower(_reported_sha256)<>u.expected_sha256 then
    update public.media_uploads set status='failed',failure_reason='sha256_mismatch',updated_at=now() where id=u.id;
    update public.media_assets set integrity_status='mismatch',processing_status='failed',moderation_status='flagged',scan_status='flagged' where id=a.id;
    raise exception 'sha256_mismatch';
  end if;
  select coalesce((o.metadata->>'size')::bigint,-1) into object_size
  from storage.objects o
  where o.bucket_id=u.bucket_id and o.name=u.storage_path;
  if object_size<>_file_size or object_size<>u.expected_size_bytes then
    update public.media_uploads set status='failed',failure_reason='size_mismatch',updated_at=now() where id=u.id;
    update public.media_assets set integrity_status='mismatch',processing_status='failed',moderation_status='flagged',scan_status='flagged' where id=a.id;
    raise exception 'size_mismatch';
  end if;

  update public.media_uploads
  set status='finalized',uploaded_at=coalesce(uploaded_at,now()),finalized_at=now(),updated_at=now()
  where id=u.id;

  update public.media_assets
  set integrity_status='pending',processing_status='queued',scan_status='pending',moderation_status='pending'
  where id=a.id;

  insert into public.media_processing_jobs(asset_id,job_type,processor,input)
  values
    (a.id,'integrity','prively',jsonb_build_object('storage_path',u.storage_path)),
    (a.id,'moderation',null,jsonb_build_object('requires_provider',true)),
    (a.id,'thumbnail',null,jsonb_build_object('mime_type',a.mime_type)),
    (a.id,'hls',null,jsonb_build_object('mime_type',a.mime_type))
  on conflict(asset_id,job_type) do nothing;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'media.upload.finalized',jsonb_build_object('asset_id',a.id,'upload_id',u.id));

  return jsonb_build_object('assetId',a.id,'status','queued');
end
$$;

create or replace function public.publish_post(_post uuid,_scheduled_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare p public.posts;
declare media_count integer;
declare ready_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into p from public.posts p0 join public.channels c on c.id=p0.channel_id where p0.id=_post and c.owner_id=auth.uid() for update;
  if not found then raise exception 'post_not_found'; end if;
  if not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then raise exception 'content_terms_required'; end if;
  select count(*) into media_count from public.media_assets where post_id=p.id and deleted_at is null;
  if media_count=0 then raise exception 'media_required'; end if;
  select count(*) into ready_count from public.media_assets
  where post_id=p.id and deleted_at is null
    and integrity_status='verified'
    and moderation_status='clean';
  if ready_count<>media_count then raise exception 'media_not_ready'; end if;
  perform set_config('app.internal_write','on',true);
  if _scheduled_at is not null and _scheduled_at>now() then
    update public.posts
    set status='scheduled',publish_at=_scheduled_at,moderation_status='clean',publication_reason='scheduled'
    where id=p.id;
  else
    update public.posts
    set status='published',publish_at=now(),moderation_status='clean',publication_reason='published'
    where id=p.id;
  end if;
  insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
  values(p.id,'restored',auth.uid(),'post_published',jsonb_build_object('visibility',p.visibility,'scheduled_at',_scheduled_at))
  ;
end
$$;

create or replace function public.remove_post(_post uuid,_reason text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare p public.posts;
begin
  select * into p
  from public.posts p0 join public.channels c on c.id=p0.channel_id
  where p0.id=_post and (c.owner_id=auth.uid() or public.has_permission(auth.uid(),'admin.moderation'))
  for update;
  if not found then raise exception 'post_not_found'; end if;
  perform set_config('app.internal_write','on',true);
  update public.posts set status='removed',publication_reason=nullif(trim(_reason),''),moderation_status='flagged' where id=p.id;
  insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
  values(p.id,'removed',auth.uid(),nullif(trim(_reason),''),jsonb_build_object('caption',p.caption,'visibility',p.visibility,'removed_at',now()));
end
$$;

create or replace function public.publish_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare published_count integer:=0;
declare r record;
begin
  for r in
    select p.id
    from public.posts p
    where p.status='scheduled'
      and p.publish_at is not null
      and p.publish_at<=now()
      and p.moderation_status='clean'
      and not exists(
        select 1 from public.media_assets a
        where a.post_id=p.id and a.deleted_at is null
          and (a.integrity_status<>'verified' or a.moderation_status<>'clean')
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

create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare a public.media_assets;
declare owner_ok boolean;
declare allowed boolean:=false;
declare reason text:='forbidden';
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into a from public.media_assets where id=_asset and deleted_at is null;
  if not found then
    insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
    values(_asset,auth.uid(),'signed_url',false,'asset_not_found');
    raise exception 'media_forbidden';
  end if;

  owner_ok:=public.is_creator_of_channel(auth.uid(),a.channel_id);
  if owner_ok then
    allowed:=true; reason:='owner';
  elsif a.post_id is not null and public.can_view_post(a.post_id,auth.uid())
        and a.integrity_status='verified'
        and a.moderation_status='clean'
        and a.scan_status='clean' then
    allowed:=true; reason:='post_access';
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
    'watermark_enabled',a.watermark_enabled,
    'watermark_text',a.watermark_text,
    'expires_in',60
  );
end
$$;

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
  p.id,p.channel_id,p.caption,p.visibility,p.price,p.status,p.publish_at,p.expires_at,p.is_story,p.moderation_status,p.created_at,
  (select count(*) from public.media_assets a where a.post_id=p.id and a.deleted_at is null)::integer,
  (select count(*) from public.media_assets a where a.post_id=p.id and a.deleted_at is null and a.integrity_status='verified' and a.moderation_status='clean')::integer
from public.posts p
join public.channels c on c.id=p.channel_id
where c.owner_id=auth.uid() and (_channel is null or p.channel_id=_channel)
order by p.created_at desc
limit 100
$$;

create or replace function public.get_media_status(_asset uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
select jsonb_build_object(
  'asset_id',a.id,
  'upload_status',u.status,
  'integrity_status',a.integrity_status,
  'processing_status',a.processing_status,
  'moderation_status',a.moderation_status,
  'scan_status',a.scan_status,
  'hls_ready',a.hls_path is not null,
  'thumbnail_ready',a.thumb_blur_path is not null,
  'watermark_enabled',a.watermark_enabled
)
from public.media_assets a
left join public.media_uploads u on u.asset_id=a.id
where a.id=_asset
  and public.is_creator_of_channel(auth.uid(),a.channel_id)
$$;

create or replace function public.requeue_media_job(_asset uuid,_job_type text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare j public.media_processing_jobs;
begin
  select j0.* into j
  from public.media_processing_jobs j0
  join public.media_assets a on a.id=j0.asset_id
  where j0.asset_id=_asset and j0.job_type=_job_type
    and (public.is_creator_of_channel(auth.uid(),a.channel_id) or public.has_permission(auth.uid(),'admin.moderation'))
  for update;
  if not found then raise exception 'job_not_found'; end if;
  update public.media_processing_jobs
  set status='queued',attempts=0,error_code=null,error_message=null,available_at=now(),started_at=null,finished_at=null
  where id=j.id;
  return j.id;
end
$$;

create or replace function public.archive_media_event(
  _asset uuid,
  _event_type text,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id=_asset for update;
  if not found then raise exception 'asset_not_found'; end if;
  if not (public.is_creator_of_channel(auth.uid(),a.channel_id) or public.has_permission(auth.uid(),'admin.audit')) then raise exception 'forbidden'; end if;
  insert into public.content_archive_events(post_id,asset_id,actor_id,event_type,reason,storage_path,sha256,snapshot)
  values(a.post_id,a.id,auth.uid(),_event_type,nullif(trim(_reason),''),a.storage_path,a.sha256,jsonb_build_object('kind',a.kind,'mime_type',a.mime_type,'file_size',a.file_size_bytes,'metadata',a.metadata));
end
$$;

-- Guard direct status mutation. Publication and moderation transitions must use SECURITY DEFINER RPCs.
create or replace function public.guard_post_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='UPDATE' and (
    new.status is distinct from old.status
    or new.moderation_status is distinct from old.moderation_status
    or new.publish_at is distinct from old.publish_at
  ) then
    if coalesce(current_setting('app.internal_write',true),'')<>'on' then
      raise exception 'post_lifecycle_server_only';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_posts_lifecycle_guard on public.posts;
create trigger trg_posts_lifecycle_guard
before update on public.posts
for each row execute function public.guard_post_lifecycle();

-- Existing scheduled publisher is replaced with the Phase 5 media gate.
revoke execute on function public.publish_scheduled_posts() from public,anon,authenticated;
grant execute on function public.publish_scheduled_posts() to service_role;

grant execute on function public.create_creator_channel(text,text,text) to authenticated;
grant execute on function public.create_post(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz) to authenticated;
grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text) to authenticated;
grant execute on function public.finalize_media_upload(uuid,text,bigint) to authenticated;
grant execute on function public.publish_post(uuid,timestamptz) to authenticated;
grant execute on function public.remove_post(uuid,text) to authenticated;
grant execute on function public.get_media_access(uuid) to authenticated;
grant execute on function public.get_creator_content(uuid) to authenticated;
grant execute on function public.get_media_status(uuid) to authenticated;
grant execute on function public.requeue_media_job(uuid,text) to authenticated;
grant execute on function public.archive_media_event(uuid,text,text) to authenticated;

revoke execute on function public.create_creator_channel(text,text,text) from anon;
revoke execute on function public.create_post(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz) from anon;
revoke execute on function public.create_media_upload(uuid,text,text,bigint,text,text) from anon;
revoke execute on function public.finalize_media_upload(uuid,text,bigint) from anon;
revoke execute on function public.publish_post(uuid,timestamptz) from anon;
revoke execute on function public.remove_post(uuid,text) from anon;
revoke execute on function public.get_media_access(uuid) from anon;
revoke execute on function public.get_creator_content(uuid) from anon;
revoke execute on function public.get_media_status(uuid) from anon;
revoke execute on function public.requeue_media_job(uuid,text) from anon;
revoke execute on function public.archive_media_event(uuid,text,text) from anon;
