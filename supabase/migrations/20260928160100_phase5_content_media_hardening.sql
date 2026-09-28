-- Phase 5 hardening: close public RPC execution and fix lifecycle/access semantics

revoke execute on function public.create_creator_channel(text,text,text) from public,anon;
revoke execute on function public.create_post(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz) from public,anon;
revoke execute on function public.create_media_upload(uuid,text,text,bigint,text,text) from public,anon;
revoke execute on function public.finalize_media_upload(uuid,text,bigint) from public,anon;
revoke execute on function public.publish_post(uuid,timestamptz) from public,anon;
revoke execute on function public.remove_post(uuid,text) from public,anon;
revoke execute on function public.get_media_access(uuid) from public,anon;
revoke execute on function public.get_creator_content(uuid) from public,anon;
revoke execute on function public.get_media_status(uuid) from public,anon;
revoke execute on function public.requeue_media_job(uuid,text) from public,anon;
revoke execute on function public.archive_media_event(uuid,text,text) from public,anon;

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

create or replace function public.get_media_access(_asset uuid)
returns jsonb
language plpgsql
volatile
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

drop policy if exists prively_private_media_insert on storage.objects;
create policy prively_private_media_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='prively-private'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(
    select 1 from public.media_uploads u
    where u.user_id=auth.uid()
      and u.bucket_id='prively-private'
      and u.storage_path=name
      and u.expires_at>now()
      and u.status in ('initiated','uploading')
  )
);

alter table public.posts
  drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check(status in ('draft','scheduled','published','removed'));

alter table public.watermark_policies
  drop constraint if exists watermark_policies_scope_check;
alter table public.watermark_policies
  add constraint watermark_policies_scope_check
  check(
    (scope='platform' and scope_id is null)
    or (scope in ('channel','post') and scope_id is not null)
  );