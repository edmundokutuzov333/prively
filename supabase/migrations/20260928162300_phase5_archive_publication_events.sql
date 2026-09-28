alter table public.content_archive_events
  drop constraint if exists content_archive_events_event_type_check;

alter table public.content_archive_events
  add constraint content_archive_events_event_type_check
  check (event_type = any(array[
    'removed',
    'flagged',
    'restored',
    'published',
    'legal_hold',
    'deleted'
  ]));

create or replace function public.publish_post(_post uuid,_scheduled_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.posts;
  media_count integer;
  ready_count integer;
  publication_event text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select p0.*
  into p
  from public.posts p0
  join public.channels c on c.id=p0.channel_id
  where p0.id=_post
    and c.owner_id=auth.uid()
  for update;

  if not found then raise exception 'post_not_found'; end if;
  if not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;

  select count(*) into media_count
  from public.media_assets
  where post_id=p.id and deleted_at is null;

  if media_count=0 then raise exception 'media_required'; end if;

  select count(*) into ready_count
  from public.media_assets
  where post_id=p.id
    and deleted_at is null
    and integrity_status='verified'
    and moderation_status='clean'
    and scan_status='clean'
    and processing_status='ready';

  if ready_count<>media_count then raise exception 'media_not_ready'; end if;

  perform set_config('app.internal_write','on',true);

  if _scheduled_at is not null and _scheduled_at>now() then
    update public.posts
    set status='scheduled',
        publish_at=_scheduled_at,
        moderation_status='clean',
        publication_reason='scheduled'
    where id=p.id;
    publication_event:='published';
  else
    update public.posts
    set status='published',
        publish_at=now(),
        moderation_status='clean',
        publication_reason='published'
    where id=p.id;
    publication_event:='published';
  end if;

  insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
  values(
    p.id,publication_event,auth.uid(),'post_published',
    jsonb_build_object('visibility',p.visibility,'scheduled_at',_scheduled_at)
  );
end
$$;

grant execute on function public.publish_post(uuid,timestamptz) to authenticated;

create or replace function public.publish_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  published_count integer:=0;
  r record;
begin
  for r in
    select p.id,p.visibility
    from public.posts p
    where p.status='scheduled'
      and p.publish_at is not null
      and p.publish_at<=now()
      and p.moderation_status='clean'
      and not exists(
        select 1
        from public.media_assets a
        where a.post_id=p.id
          and a.deleted_at is null
          and (
            a.integrity_status<>'verified'
            or a.moderation_status<>'clean'
            or a.scan_status<>'clean'
            or a.processing_status<>'ready'
          )
      )
      and exists(
        select 1 from public.media_assets a
        where a.post_id=p.id and a.deleted_at is null
      )
    for update skip locked
  loop
    perform set_config('app.internal_write','on',true);
    update public.posts
    set status='published',
        publication_reason='published'
    where id=r.id;

    insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
    values(
      r.id,'published',null,'scheduled_publication',
      jsonb_build_object('visibility',r.visibility,'published_at',now())
    );

    published_count:=published_count+1;
  end loop;

  return published_count;
end
$$;

revoke execute on function public.publish_scheduled_posts() from public,anon,authenticated;
grant execute on function public.publish_scheduled_posts() to service_role;