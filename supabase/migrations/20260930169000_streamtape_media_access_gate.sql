create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean
language plpgsql stable security definer
set search_path=public,pg_temp
as $function$
declare
  p public.posts;
  c public.channels;
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

  if exists (
    select 1 from public.media_assets ma
    where ma.post_id=p.id and ma.deleted_at is null
      and coalesce(ma.processing_status,'processing')<>'ready'
  ) then return false; end if;

  if exists (
    select 1 from public.media_assets ma
    where ma.post_id=p.id and ma.deleted_at is null
      and ma.kind='video'
      and ma.storage_provider='backblaze_b2'
      and coalesce(ma.streamtape_status,'not_started')<>'ready'
  ) then return false; end if;

  if not public.is_age_verified(_uid) then return false; end if;

  if exists (
    select 1 from public.blocks
    where (owner_id=c.owner_id and blocked_user_id=_uid)
       or (owner_id=_uid and blocked_user_id=c.owner_id)
  ) then return false; end if;

  if exists (
    select 1 from public.hidden_from
    where channel_id=c.id and user_id=_uid
  ) then return false; end if;

  return case p.visibility
    when 'public' then true
    when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
      or exists(
        select 1 from public.bundle_purchases bp
        join public.bundle_items bi on bi.bundle_id=bp.bundle_id
        where bp.buyer_id=_uid and bi.post_id=p.id
      )
    else false
  end;
end
$function$;

create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
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
  where id=_asset and deleted_at is null;

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
    and a.processing_status='ready'
  then
    allowed:=true;
    reason:='post_access';
  end if;

  insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
  values(a.id,auth.uid(),'signed_url',allowed,reason);

  if not allowed then raise exception 'media_forbidden'; end if;

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

revoke all on function public.can_view_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_view_post(uuid,uuid) to authenticated,service_role;

revoke all on function public.get_media_access(uuid) from public,anon;
grant execute on function public.get_media_access(uuid) to authenticated,service_role;
