-- Prively Fase 13: safety runtime contract hardening.
-- Reuses the Phase 8 safety model. Does not recreate reports/panic tables.

create or replace function public.create_panic_event(
  _share_location boolean default false,
  _location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  p_id uuid;
  location_user uuid;
  location_source text;
  location_expires timestamptz;
  location_purged timestamptz;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _share_location and _location_id is null then
    raise exception 'panic_location_required';
  end if;

  if _location_id is not null then
    select user_id, source, expires_at, purged_at
      into location_user, location_source, location_expires, location_purged
    from public.safety_location_shares
    where id = _location_id;

    if location_user is null
      or location_user <> auth.uid()
      or location_source <> 'panic'
      or location_purged is not null
      or location_expires <= now() then
      raise exception 'invalid_panic_location';
    end if;
  end if;

  if not _share_location then
    _location_id := null;
  end if;

  insert into public.panic_events(user_id, share_location, location_id)
  values(auth.uid(), _share_location, _location_id)
  returning id into p_id;

  update public.safety_checkins
     set status = 'alerted',
         alerted_at = now()
   where user_id = auth.uid()
     and status = 'active';

  perform public.phase8_audit(
    'panic_event_created',
    'panic_event',
    p_id,
    null,
    jsonb_build_object(
      'share_location', _share_location,
      'location_id', _location_id
    )
  );

  return p_id;
end;
$function$;

revoke all on function public.create_panic_event(boolean,uuid) from public, anon, authenticated;
grant execute on function public.create_panic_event(boolean,uuid) to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.reports from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.panic_events from public, anon, authenticated;

grant select on public.reports to authenticated;
grant select on public.panic_events to authenticated;
