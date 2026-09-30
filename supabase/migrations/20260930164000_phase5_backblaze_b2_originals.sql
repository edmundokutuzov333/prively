alter table public.media_assets
  add column if not exists storage_provider text not null default 'supabase';

alter table public.media_assets
  drop constraint if exists media_assets_storage_provider_check;

alter table public.media_assets
  add constraint media_assets_storage_provider_check
  check (storage_provider in ('supabase','backblaze_b2'));

create or replace function public.create_media_upload(
  _post uuid,
  _kind text,
  _mime_type text,
  _file_size bigint,
  _sha256 text default null,
  _original_filename text default 'file',
  _participants_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $function$
declare
  existing_upload public.media_uploads;
  p public.posts;
  asset_id uuid:=gen_random_uuid();
  upload_id uuid:=gen_random_uuid();
  safe_name text:=public._content_name(_original_filename);
  storage_path text;
  channel_owner uuid;
  size_limit bigint;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not _participants_consent then raise exception 'participant_consent_required'; end if;

  if _sha256 is not null then
    select u.* into existing_upload
    from public.media_uploads u
    join public.media_assets a on a.id=u.asset_id
    where u.user_id=auth.uid() and a.post_id=_post
      and u.status in ('initiated','uploading') and u.expires_at>now()
      and u.expected_size_bytes=_file_size and u.expected_sha256=lower(_sha256)
      and u.mime_type=_mime_type
    order by u.created_at desc limit 1 for update;

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

  select * into p from public.posts where id=_post for update;
  if not found then raise exception 'post_not_found'; end if;

  select owner_id into channel_owner from public.channels where id=p.channel_id;
  if channel_owner<>auth.uid() then raise exception 'post_forbidden'; end if;
  if p.status not in ('draft','scheduled') then raise exception 'post_not_editable'; end if;
  if not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then raise exception 'content_terms_required'; end if;

  if _file_size<=0 then raise exception 'invalid_file_size'; end if;
  if _sha256 is not null and _sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_sha256'; end if;
  if _kind not in ('image','video','audio') then raise exception 'invalid_media_kind'; end if;
  if nullif(trim(_mime_type),'') is null then raise exception 'mime_type_required'; end if;

  if _kind='image' then
    size_limit:=52428800;
    if _mime_type not in ('image/jpeg','image/png','image/webp','image/gif') then raise exception 'unsupported_image_type'; end if;
  elsif _kind='video' then
    size_limit:=104857600;
    if _mime_type not in ('video/mp4','video/webm','video/quicktime') then raise exception 'unsupported_video_type'; end if;
  else
    size_limit:=104857600;
    if _mime_type not in ('audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac') then raise exception 'unsupported_audio_type'; end if;
  end if;

  if _file_size>size_limit then raise exception 'file_too_large'; end if;
  if safe_name is null or safe_name='' then safe_name:='file'; end if;

  storage_path:=auth.uid()::text||'/media/'||asset_id::text||'/original/'||safe_name;

  insert into public.media_assets(
    id,post_id,channel_id,kind,storage_path,storage_provider,sha256,scan_status,mime_type,
    original_filename,file_size_bytes,client_sha256,integrity_status,
    processing_status,moderation_status,watermark_text,watermark_enabled,metadata
  ) values(
    asset_id,p.id,p.channel_id,_kind,storage_path,'backblaze_b2',nullif(lower(_sha256),''),
    'pending',_mime_type,safe_name,_file_size,nullif(lower(_sha256),''),
    'pending','pending','pending',
    '@'||(select handle::text from public.profiles where id=auth.uid())||' • '||left(asset_id::text,8),
    coalesce(p.watermark_enabled,true),
    jsonb_build_object(
      'participant_consent_declared',true,
      'participant_consent_declared_at',now(),
      'storage_provider','backblaze_b2',
      'bucket','prively-media-originals-2026'
    )
  );

  insert into public.media_uploads(
    id,asset_id,user_id,bucket_id,storage_path,expected_size_bytes,
    expected_sha256,mime_type,original_filename,status,expires_at
  ) values(
    upload_id,asset_id,auth.uid(),'prively-media-originals-2026',storage_path,_file_size,
    nullif(lower(_sha256),''),_mime_type,safe_name,'initiated',now()+interval '2 hours'
  );

  insert into public.media_consents(asset_id,user_id,consent_type,document_version,metadata)
  values
    (asset_id,auth.uid(),'upload','1.0',jsonb_build_object('declared',true)),
    (asset_id,auth.uid(),'rights','1.0',jsonb_build_object('declared',true)),
    (asset_id,auth.uid(),'participants','1.0',jsonb_build_object('all_adults',true,'all_consented',true,'declared_by_creator',auth.uid())),
    (asset_id,auth.uid(),'watermark','1.0',jsonb_build_object('declared',true))
  on conflict do nothing;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'media.upload.created',jsonb_build_object(
    'asset_id',asset_id,'post_id',p.id,'kind',_kind,'size',_file_size,
    'participant_consent',true,'storage_provider','backblaze_b2'
  ));

  return jsonb_build_object(
    'uploadId',upload_id,
    'assetId',asset_id,
    'path',storage_path,
    'bucket','prively-media-originals-2026',
    'provider','backblaze_b2',
    'expiresAt',now()+interval '2 hours'
  );
end
$function$;

revoke all on function public.create_media_upload(uuid,text,text,bigint,text,text,boolean) from public,anon;
grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text,boolean) to authenticated;
