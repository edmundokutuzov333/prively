-- Phase 5: enforce the communication privacy acceptance inside live access itself.

create or replace function public.issue_live_access(_session uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  s public.live_sessions;
  c public.call_sessions;
  uid uuid:=auth.uid();
  owner_id uuid;
begin
  if not public.is_age_verified(uid) then raise exception 'age_not_verified'; end if;

  select * into s from public.live_sessions where id=_session for update;
  if found then
    select ch.owner_id into owner_id from public.channels ch where ch.id=s.channel_id;
    if public.is_blocked(owner_id,uid) then raise exception 'user_blocked'; end if;
    if public.is_hidden_from(s.channel_id,uid) and owner_id<>uid then raise exception 'channel_hidden'; end if;
    if s.status not in ('scheduled','live') then raise exception 'live_not_available'; end if;
    if s.scheduled_at is not null and s.scheduled_at>now() then raise exception 'live_not_available'; end if;
    if s.mode='paid' and owner_id<>uid and not exists(
      select 1 from public.live_tickets where live_session_id=s.id and buyer_id=uid
    ) then raise exception 'live_ticket_required'; end if;
    if s.mode='private' and uid<>owner_id and uid<>s.private_client_id then
      raise exception 'private_live_not_allowed';
    end if;
    if s.mode='private' and uid=s.private_client_id and coalesce(
      (select balance from public.balances where owner_id=uid and account='wallet'),0
    )<coalesce(s.per_minute_price,0) then raise exception 'insufficient_funds'; end if;

    update public.live_sessions
    set status='live',started_at=coalesce(started_at,now()),last_heartbeat_at=now()
    where public.live_sessions.id=s.id;

    return jsonb_build_object(
      'kind','live','session_id',s.id,'room_name',s.room_name,'mode',s.mode,
      'role',case when uid=owner_id then 'host' else 'viewer' end,
      'per_minute_price',s.per_minute_price
    );
  end if;

  select * into c from public.call_sessions where public.call_sessions.id=_session for update;
  if found then
    if c.status in('ended','cancelled') then raise exception 'call_not_available'; end if;
    if c.client_id<>uid and not public.is_creator_of_channel(uid,c.channel_id) then
      raise exception 'call_not_available';
    end if;
    if c.client_id<>uid then
      perform public.assert_communication_privacy('call');
    end if;
    if public.is_blocked(c.client_id,(select ch.owner_id from public.channels ch where ch.id=c.channel_id)) then
      raise exception 'user_blocked';
    end if;
    if c.client_id=uid and coalesce(
      (select balance from public.balances where owner_id=uid and account='wallet'),0
    )<c.per_minute_price then raise exception 'insufficient_funds'; end if;

    update public.call_sessions
    set status='active',started_at=coalesce(started_at,now()),last_heartbeat_at=now()
    where public.call_sessions.id=c.id;

    return jsonb_build_object(
      'kind','call','session_id',c.id,'room_name',c.room_name,'mode',c.kind,
      'role',case when c.client_id=uid then 'caller' else 'host' end,
      'per_minute_price',c.per_minute_price
    );
  end if;

  raise exception 'session_not_found';
end
$function$;

grant execute on function public.issue_live_access(uuid) to authenticated;
