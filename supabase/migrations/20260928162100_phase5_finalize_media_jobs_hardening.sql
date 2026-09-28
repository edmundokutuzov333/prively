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
    values(a.id,'hls',null,jsonb_build_object('mime_type',a.mime_type))
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
    auth.uid(),auth.uid(),'media.upload.finalized',
    jsonb_build_object('asset_id',a.id,'upload_id',u.id)
  );

  return jsonb_build_object('assetId',a.id,'status','queued');
end
$$;

grant execute on function public.finalize_media_upload(uuid,text,bigint) to authenticated;