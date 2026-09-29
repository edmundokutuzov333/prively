
create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql
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
    'caption_path',a.caption_path,
    'face_blur_path',a.face_blur_path,
    'watermark_enabled',a.watermark_enabled,
    'watermark_text',a.watermark_text,
    'processing_status',a.processing_status,
    'expires_in',60
  );
end
$$;

revoke all on function public.get_media_access(uuid) from public,anon;
grant execute on function public.get_media_access(uuid) to authenticated;
