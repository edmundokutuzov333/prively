create or replace function public.update_creator_channel(
  _channel uuid,
  _handle text,
  _display_name text,
  _bio text default null,
  _city text default null,
  _bairro text default null,
  _province text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
  normalized_handle text := lower(trim(_handle));
begin
  if current_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not public.has_role(current_user_id, 'creator') then
    raise exception 'not_creator';
  end if;

  if _channel is null then
    raise exception 'channel_not_found';
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
      and c.id <> _channel
  ) then
    raise exception 'channel_handle_taken';
  end if;

  update public.channels
  set handle = normalized_handle::public.citext,
      display_name = trim(_display_name),
      bio = nullif(trim(_bio), ''),
      city = nullif(trim(_city), ''),
      bairro = nullif(trim(_bairro), ''),
      province = nullif(trim(_province), ''),
      updated_at = now()
  where id = _channel
    and owner_id = current_user_id
    and is_seed = false;

  if not found then
    raise exception 'channel_forbidden';
  end if;

  if to_regclass('public.security_events') is not null then
    insert into public.security_events(user_id, actor_id, event_type, metadata)
    values(
      current_user_id,
      current_user_id,
      'channel.updated',
      jsonb_build_object(
        'channel_id', _channel,
        'handle', normalized_handle
      )
    );
  end if;

  return _channel;
end
$function$;

revoke all on function public.update_creator_channel(uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.update_creator_channel(uuid,text,text,text,text,text,text) to authenticated;
