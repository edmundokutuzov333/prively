-- Phase 3 channel visibility and authorization reconciliation.
-- Forward-only hardening. Does not mutate migration history or production data.

create or replace function private.is_profile_active(_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.profiles
    where id = _profile
      and status = 'active'
  );
$function$;

revoke all on function private.is_profile_active(uuid) from public, anon, authenticated;

drop policy if exists channel_select_public on public.channels;
create policy channel_select_public
on public.channels
for select
to authenticated
using (
  is_seed = false
  and private.is_profile_active(owner_id)
);

create or replace function public.create_creator_channel(
  _handle text,
  _display_name text,
  _bio text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  channel_id uuid := gen_random_uuid();
  normalized_handle citext := lower(trim(_handle));
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not public.has_role(current_user_id, 'creator') then
    raise exception 'not_creator';
  end if;

  if not public.is_age_verified(current_user_id) then
    raise exception 'age_not_verified';
  end if;

  if not public.has_current_creator_terms(current_user_id) then
    raise exception 'creator_terms_required';
  end if;

  if normalized_handle is null or normalized_handle !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid_channel_handle';
  end if;

  if char_length(trim(coalesce(_display_name, ''))) not between 2 and 60 then
    raise exception 'display_name_invalid';
  end if;

  if _bio is not null and char_length(_bio) > 500 then
    raise exception 'bio_too_long';
  end if;

  if exists (
    select 1
    from public.channels c
    where c.handle = normalized_handle
  ) then
    raise exception 'channel_handle_taken';
  end if;

  insert into public.channels (
    id,
    owner_id,
    handle,
    display_name,
    bio,
    is_seed
  )
  values (
    channel_id,
    current_user_id,
    normalized_handle,
    trim(_display_name),
    nullif(trim(_bio), ''),
    false
  );

  if to_regclass('public.security_events') is not null then
    insert into public.security_events (
      user_id,
      actor_id,
      event_type,
      metadata
    )
    values (
      current_user_id,
      current_user_id,
      'channel.created',
      jsonb_build_object(
        'channel_id', channel_id,
        'handle', normalized_handle
      )
    );
  end if;

  return channel_id;
end
$function$;

revoke all on function public.create_creator_channel(text, text, text) from public, anon;
grant execute on function public.create_creator_channel(text, text, text) to authenticated;
