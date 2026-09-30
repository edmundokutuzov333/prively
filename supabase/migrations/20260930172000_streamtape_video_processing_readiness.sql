create or replace function public.refresh_media_processing_status(_asset uuid)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $
declare
  a public.media_assets;
  has_failed boolean:=false;
  has_active boolean:=false;
  missing_derivative boolean:=false;
  next_status text;
begin
  select * into a
  from public.media_assets
  where id=_asset and deleted_at is null
  for update;

  if not found then raise exception 'asset_not_found'; end if;

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
    update public.media_assets set processing_status=next_status,ready_at=null where id=a.id;
    return next_status;
  end if;

  if a.kind='video' then
    select exists(
      select 1 from public.media_processing_jobs j
      where j.asset_id=a.id
        and j.job_type in ('integrity','moderation')
        and j.status in ('failed','blocked')
    ),
    exists(
      select 1 from public.media_processing_jobs j
      where j.asset_id=a.id
        and j.job_type in ('integrity','moderation')
        and j.status in ('queued','processing')
    )
    into has_failed,has_active;

    if has_failed then
      update public.media_assets set processing_status='failed',ready_at=null where id=a.id;
      return 'failed';
    end if;

    if has_active then
      update public.media_assets set processing_status='processing',ready_at=null where id=a.id;
      return 'processing';
    end if;

    update public.media_assets
    set processing_status='ready',ready_at=coalesce(ready_at,now())
    where id=a.id;
    return 'ready';
  end if;

  select
    exists(
      select 1 from public.media_processing_jobs j
      where j.asset_id=a.id and j.status in ('failed','blocked')
    ),
    exists(
      select 1 from public.media_processing_jobs j
      where j.asset_id=a.id and j.status in ('queued','processing')
    )
  into has_failed,has_active;

  if has_failed then
    update public.media_assets set processing_status='failed',ready_at=null where id=a.id;
    return 'failed';
  end if;

  if has_active then
    update public.media_assets set processing_status='processing',ready_at=null where id=a.id;
    return 'processing';
  end if;

  missing_derivative:=
    (a.kind in ('image','video') and a.thumb_blur_path is null)
    or (a.kind='video' and a.hls_path is null)
    or (a.kind in ('image','video') and a.watermark_enabled and a.watermark_path is null);

  if missing_derivative then
    update public.media_assets set processing_status='processing',ready_at=null where id=a.id;
    return 'processing';
  end if;

  update public.media_assets
  set processing_status='ready',ready_at=coalesce(ready_at,now())
  where id=a.id;
  return 'ready';
end
$$;

revoke execute on function public.refresh_media_processing_status(uuid) from public,anon,authenticated;
grant execute on function public.refresh_media_processing_status(uuid) to service_role;
