-- Phase 7: production content publication contract.
-- Forward-only hardening for consent, publication authorization and direct-table access.

create table if not exists public.content_consents (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  attested_by uuid not null references public.profiles(id) on delete cascade,
  attested_at timestamptz not null default now(),
  participants_adult_confirmed boolean not null,
  constraint content_consents_participants_adult_confirmed_true
    check (participants_adult_confirmed = true),
  constraint content_consents_post_unique unique (post_id)
);

alter table public.content_consents enable row level security;

drop policy if exists content_consents_owner_read on public.content_consents;
create policy content_consents_owner_read
on public.content_consents
for select
to authenticated
using (
  exists (
    select 1
    from public.posts p
    join public.channels c on c.id = p.channel_id
    where p.id = content_consents.post_id
      and c.owner_id = (select auth.uid())
  )
);

drop policy if exists content_consents_owner_insert on public.content_consents;
create policy content_consents_owner_insert
on public.content_consents
for insert
to authenticated
with check (
  attested_by = (select auth.uid())
  and exists (
    select 1
    from public.posts p
    join public.channels c on c.id = p.channel_id
    where p.id = content_consents.post_id
      and c.owner_id = (select auth.uid())
      and p.status in ('draft', 'scheduled')
  )
  and participants_adult_confirmed = true
);

create index if not exists content_consents_attested_by_idx
on public.content_consents(attested_by);

create or replace function public.guard_content_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and auth.role() <> 'service_role' then
      new.attested_by := auth.uid();
      new.attested_at := now();
    elsif new.attested_at is null then
      new.attested_at := now();
    end if;

    if new.participants_adult_confirmed is not true then
      raise exception 'participant_consent_required';
    end if;

    return new;
  end if;

  raise exception 'content_consent_is_immutable';
end;
$function$;

drop trigger if exists trg_content_consents_immutable on public.content_consents;
create trigger trg_content_consents_immutable
before insert or update or delete
on public.content_consents
for each row
execute function public.guard_content_consent();

revoke all on function public.guard_content_consent() from public, anon, authenticated;

revoke all on table public.content_consents from public, anon, authenticated;
grant select on table public.content_consents to authenticated;

create or replace function public.attest_post_content_consent(
  _post uuid,
  _participants_adult_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  post_row public.posts;
  existing_id uuid;
  consent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _participants_adult_confirmed is not true then
    raise exception 'participant_consent_required';
  end if;

  select p.*
    into post_row
  from public.posts p
  join public.channels c on c.id = p.channel_id
  where p.id = _post
    and c.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'post_not_found';
  end if;

  if post_row.status not in ('draft', 'scheduled') then
    raise exception 'post_not_editable';
  end if;

  select cc.id
    into existing_id
  from public.content_consents cc
  where cc.post_id = _post
  for update;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.content_consents(post_id, attested_by, participants_adult_confirmed)
  values (_post, auth.uid(), true)
  returning id into consent_id;

  return consent_id;
end;
$function$;

revoke all on function public.attest_post_content_consent(uuid, boolean) from public, anon;
grant execute on function public.attest_post_content_consent(uuid, boolean) to authenticated;

create or replace function public.publish_post(
  _post uuid,
  _scheduled_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  p public.posts;
  media_count integer;
  ready_count integer;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select p0.*
    into p
  from public.posts p0
  join public.channels c on c.id = p0.channel_id
  where p0.id = _post
    and c.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'post_not_found';
  end if;

  if not public.has_current_creator_terms(auth.uid())
     or not public.has_legal_acceptance(auth.uid(), 'content_prohibited', '1.0') then
    raise exception 'content_terms_required';
  end if;

  if not exists (
    select 1
    from public.kyc_verifications
    where user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'creator_verification_required';
  end if;

  if not exists (
    select 1
    from public.content_consents cc
    where cc.post_id = p.id
      and cc.participants_adult_confirmed = true
  ) then
    raise exception 'participant_consent_required';
  end if;

  select count(*)
    into media_count
  from public.media_assets
  where post_id = p.id
    and deleted_at is null;

  if media_count = 0 then
    raise exception 'media_required';
  end if;

  select count(*)
    into ready_count
  from public.media_assets
  where post_id = p.id
    and deleted_at is null
    and integrity_status = 'verified'
    and moderation_status = 'clean'
    and scan_status = 'clean'
    and processing_status = 'ready';

  if ready_count <> media_count then
    raise exception 'media_not_ready';
  end if;

  perform set_config('app.internal_write', 'on', true);

  if _scheduled_at is not null and _scheduled_at > now() then
    update public.posts
    set status = 'scheduled',
        publish_at = _scheduled_at,
        moderation_status = 'clean',
        publication_reason = 'scheduled'
    where id = p.id;
  else
    update public.posts
    set status = 'published',
        publish_at = now(),
        moderation_status = 'clean',
        publication_reason = 'published'
    where id = p.id;
  end if;

  insert into public.content_archive_events(post_id, event_type, actor_id, reason, snapshot)
  values (
    p.id,
    'published',
    auth.uid(),
    case when _scheduled_at is not null and _scheduled_at > now()
      then 'post_scheduled'
      else 'post_published'
    end,
    jsonb_build_object(
      'visibility', p.visibility,
      'scheduled_at', _scheduled_at
    )
  );
end;
$function$;

revoke all on function public.publish_post(uuid, timestamptz) from public, anon;
grant execute on function public.publish_post(uuid, timestamptz) to authenticated;

create or replace function public.publish_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  published_count integer := 0;
  r record;
begin
  for r in
    select p.id, p.visibility
    from public.posts p
    where p.status = 'scheduled'
      and p.publish_at is not null
      and p.publish_at <= now()
      and p.moderation_status = 'clean'
      and exists (
        select 1
        from public.content_consents cc
        where cc.post_id = p.id
          and cc.participants_adult_confirmed = true
      )
      and not exists (
        select 1
        from public.media_assets a
        where a.post_id = p.id
          and a.deleted_at is null
          and (
            a.integrity_status <> 'verified'
            or a.moderation_status <> 'clean'
            or a.scan_status <> 'clean'
            or a.processing_status <> 'ready'
          )
      )
      and exists (
        select 1
        from public.media_assets a
        where a.post_id = p.id
          and a.deleted_at is null
      )
    for update skip locked
  loop
    perform set_config('app.internal_write', 'on', true);

    update public.posts
    set status = 'published',
        publication_reason = 'published'
    where id = r.id;

    insert into public.content_archive_events(post_id, event_type, actor_id, reason, snapshot)
    values (
      r.id,
      'published',
      null,
      'scheduled_publication',
      jsonb_build_object(
        'visibility', r.visibility,
        'published_at', now()
      )
    );

    published_count := published_count + 1;
  end loop;

  return published_count;
end;
$function$;

revoke all on function public.publish_scheduled_posts() from public, anon, authenticated;
grant execute on function public.publish_scheduled_posts() to service_role;

drop policy if exists posts_owner_write on public.posts;
drop policy if exists posts_owner_update on public.posts;
drop policy if exists posts_owner_delete on public.posts;

revoke all on table public.posts from public, anon, authenticated;
grant select on table public.posts to authenticated;

grant select on table public.content_consents to authenticated;
