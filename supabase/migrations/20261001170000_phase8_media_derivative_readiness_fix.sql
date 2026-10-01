-- Phase 8: fail-closed media derivative readiness.
-- Existing certified media delivery functions are intentionally untouched.
-- This migration fixes the video fast-path that could mark a video ready
-- before server-generated derivatives and Streamtape delivery were ready.

create or replace function public.refresh_media_processing_status(_asset uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  a public.media_assets;
  has_failed boolean := false;
  has_active boolean := false;
  missing_derivative boolean := false;
  next_status text;
begin
  select *
  into a
  from public.media_assets
  where id = _asset
    and deleted_at is null
  for update;

  if not found then
    raise exception 'asset_not_found';
  end if;

  if a.integrity_status <> 'verified'
     or a.moderation_status <> 'clean'
     or a.scan_status <> 'clean'
  then
    next_status := case
      when a.integrity_status in ('mismatch','unverified')
        or a.moderation_status in ('flagged','review')
        or a.scan_status in ('flagged','error')
      then 'failed'
      else 'queued'
    end;

    update public.media_assets
    set processing_status = next_status,
        ready_at = null
    where id = a.id;

    return next_status;
  end if;

  select
    exists (
      select 1
      from public.media_processing_jobs j
      where j.asset_id = a.id
        and j.status in ('failed','blocked')
    ),
    exists (
      select 1
      from public.media_processing_jobs j
      where j.asset_id = a.id
        and j.status in ('queued','processing')
    )
  into has_failed, has_active;

  if has_failed then
    update public.media_assets
    set processing_status = 'failed',
        ready_at = null
    where id = a.id;

    return 'failed';
  end if;

  if has_active then
    update public.media_assets
    set processing_status = 'processing',
        ready_at = null
    where id = a.id;

    return 'processing';
  end if;

  missing_derivative :=
       (a.kind in ('image','video') and a.thumb_blur_path is null)
    or (a.kind = 'video' and a.hls_path is null)
    or (a.kind in ('image','video') and a.watermark_enabled and a.watermark_path is null)
    or (a.kind = 'video' and a.storage_provider = 'backblaze_b2'
        and coalesce(a.streamtape_status,'not_started') <> 'ready');

  if missing_derivative then
    update public.media_assets
    set processing_status = 'processing',
        ready_at = null
    where id = a.id;

    return 'processing';
  end if;

  update public.media_assets
  set processing_status = 'ready',
      ready_at = coalesce(ready_at, now())
  where id = a.id;

  return 'ready';
end;
$function$;

revoke all on function public.refresh_media_processing_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_media_processing_status(uuid) to service_role;

create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  a public.media_assets;
  owner_ok boolean;
  admin_ok boolean;
  allowed boolean := false;
  reason text := 'forbidden';
  derivative_ready boolean := true;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select *
  into a
  from public.media_assets
  where id = _asset
    and deleted_at is null;

  if not found then
    insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
    values(_asset,auth.uid(),'signed_url',false,'asset_not_found');

    raise exception 'media_forbidden';
  end if;

  owner_ok := public.is_creator_of_channel(auth.uid(),a.channel_id);
  admin_ok := public.has_permission(auth.uid(),'admin.moderation');

  derivative_ready :=
       a.processing_status = 'ready'
    and a.integrity_status = 'verified'
    and a.moderation_status = 'clean'
    and a.scan_status = 'clean'
    and a.thumb_blur_path is not null
    and (not a.watermark_enabled or a.watermark_path is not null)
    and (
      a.kind <> 'video'
      or (
        a.hls_path is not null
        and (
          a.storage_provider <> 'backblaze_b2'
          or coalesce(a.streamtape_status,'not_started') = 'ready'
        )
      )
    );

  if owner_ok then
    allowed := true;
    reason := 'owner';
  elsif admin_ok then
    allowed := true;
    reason := 'moderation_admin';
  elsif a.post_id is not null
    and derivative_ready
    and public.can_view_post(a.post_id,auth.uid())
  then
    allowed := true;
    reason := 'post_access';
  end if;

  insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
  values(a.id,auth.uid(),'signed_url',allowed,reason);

  if not allowed then
    raise exception 'media_forbidden';
  end if;

  return jsonb_build_object(
    'asset_id',a.id,
    'path',a.storage_path,
    'storage_provider',a.storage_provider,
    'kind',a.kind,
    'hls_path',a.hls_path,
    'thumb_blur_path',a.thumb_blur_path,
    'watermark_path',a.watermark_path,
    'caption_path',a.caption_path,
    'face_blur_path',a.face_blur_path,
    'watermark_enabled',a.watermark_enabled,
    'watermark_text',a.watermark_text,
    'processing_status',a.processing_status,
    'streamtape_status',a.streamtape_status,
    'streamtape_upload_id',a.streamtape_upload_id,
    'streamtape_file_id',a.streamtape_file_id,
    'expires_in',60
  );
end
$function$;

revoke all on function public.get_media_access(uuid) from public, anon, authenticated;
grant execute on function public.get_media_access(uuid) to authenticated;
