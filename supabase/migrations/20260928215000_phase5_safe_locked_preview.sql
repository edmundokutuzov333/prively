-- Phase 5 hardening: safe locked-media previews
--
-- This function may return only a server-generated blurred derivative and
-- non-reversible blurhash. It never returns the original media path, HLS path,
-- watermark path or any signed URL.

create or replace function public.get_media_preview(_asset uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  a public.media_assets;
  p public.posts;
  c public.channels;
  allowed boolean:=false;
  reason text:='forbidden';
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select * into a
  from public.media_assets
  where id=_asset
    and deleted_at is null;

  if not found or a.post_id is null then
    insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
    values(_asset,auth.uid(),'thumbnail',false,'asset_not_found');
    raise exception 'media_preview_forbidden';
  end if;

  select * into p from public.posts where id=a.post_id;
  select * into c from public.channels where id=a.channel_id;

  if p.status<>'published'
     or (p.publish_at is not null and p.publish_at>now())
     or (p.expires_at is not null and p.expires_at<=now()) then
    reason:='post_not_published';
  elsif not public.is_age_verified(auth.uid()) then
    reason:='age_not_verified';
  elsif public.is_blocked(c.owner_id,auth.uid())
        or public.is_hidden_from(c.id,auth.uid()) then
    reason:='blocked_or_hidden';
  elsif p.visibility='private' then
    reason:='private_post';
  elsif p.visibility='followers'
        and not exists(
          select 1 from public.follows
          where follower_id=auth.uid()
            and channel_id=c.id
        ) then
    reason:='not_follower';
  else
    allowed:=true;
    reason:='locked_preview';
  end if;

  if allowed
     and (
       a.thumb_blur_path is null
       or a.integrity_status<>'verified'
       or a.moderation_status<>'clean'
       or a.scan_status<>'clean'
     ) then
    allowed:=false;
    reason:='preview_not_ready';
  end if;

  insert into public.media_access_logs(asset_id,user_id,action,granted,reason)
  values(a.id,auth.uid(),'thumbnail',allowed,reason);

  if not allowed then raise exception 'media_preview_forbidden'; end if;

  return jsonb_build_object(
    'asset_id',a.id,
    'kind',a.kind,
    'thumbnail_path',a.thumb_blur_path,
    'blurhash',p.blurhash,
    'expires_in',60
  );
end
$$;

revoke all on function public.get_media_preview(uuid) from public, anon;
grant execute on function public.get_media_preview(uuid) to authenticated;
