-- Prively Phase 7 live/chat hardening and access contract.

drop policy if exists message_attachments_member_read on public.message_attachments;
create policy message_attachments_member_read
on public.message_attachments for select to authenticated
using (
  exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id=message_attachments.conversation_id
      and cm.user_id=auth.uid()
  )
  and (
    owner_id=auth.uid()
    or (
      status='attached'
      and exists(
        select 1
        from public.messages m
        where m.id=message_attachments.message_id
          and (
            m.price is null
            or m.sender_id=auth.uid()
            or exists(select 1 from public.message_unlocks u where u.message_id=m.id and u.user_id=auth.uid())
          )
      )
    )
  )
);

drop policy if exists live_read on public.live_sessions;
create policy live_read
on public.live_sessions for select to authenticated
using (
  (
    exists(select 1 from public.channels c where c.id=live_sessions.channel_id and c.owner_id=auth.uid())
    or (
      live_sessions.mode in ('free','paid')
      and public.is_age_verified(auth.uid())
      and not public.is_blocked((select owner_id from public.channels where id=live_sessions.channel_id),auth.uid())
    )
    or (
      live_sessions.mode='private'
      and live_sessions.private_client_id=auth.uid()
    )
  )
);

create or replace function public.create_live_session(
  _channel uuid,
  _mode text,
  _title text,
  _description text default null,
  _price bigint default null,
  _per_minute_price bigint default null,
  _scheduled_at timestamptz default null,
  _private_client uuid default null
)
returns uuid
language plpgsql security definer set search_path=public
as $phase7$
declare id uuid:=gen_random_uuid(); owner_id uuid;
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'channel_forbidden'; end if;
  if _mode not in ('free','paid','private') then raise exception 'invalid_live_mode'; end if;
  if char_length(trim(coalesce(_title,'')))<1 or char_length(_title)>160 then raise exception 'invalid_live_title'; end if;

  if _mode='paid' and coalesce(_price,0)<=0 then raise exception 'live_price_required'; end if;
  if _mode='private' then
    if _private_client is null then raise exception 'private_client_required'; end if;
    if _per_minute_price is null or _per_minute_price<=0 then raise exception 'per_minute_price_required'; end if;
    if public.is_blocked(auth.uid(),_private_client) then raise exception 'user_blocked'; end if;
    if not exists(select 1 from public.profiles where id=_private_client) then raise exception 'user_not_found'; end if;
  end if;

  select owner_id into owner_id from public.channels where id=_channel;
  insert into public.live_sessions(
    id,channel_id,mode,title,description,price,per_minute_price,private_client_id,
    scheduled_at,status,room_name
  )
  values(
    id,_channel,_mode,trim(_title),nullif(trim(_description),''),case when _mode='paid' then _price else null end,
    case when _mode='private' then _per_minute_price else null end,
    case when _mode='private' then _private_client else null end,
    _scheduled_at,'scheduled','prively-live-'||id::text
  );
  return id;
end;
$phase7$;

create or replace function public.heartbeat_live(_session uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $phase7$
declare s public.live_sessions; owner_id uuid;
begin
  select * into s from public.live_sessions
  where id=_session and status='live'
  for update;
  if not found then raise exception 'live_not_active'; end if;

  select c.owner_id into owner_id from public.channels c where c.id=s.channel_id;
  if auth.uid()<>owner_id and auth.uid()<>s.private_client_id then
    raise exception 'forbidden';
  end if;
  update public.live_sessions set last_heartbeat_at=now() where id=_session;

  return jsonb_build_object('session_id',_session,'server_time',now(),'status','live');
end;
$phase7$;

create or replace function public.end_live(_session uuid,_reason text default 'ended_by_host')
returns void
language plpgsql security definer set search_path=public
as $phase7$
begin
  update public.live_sessions s
  set status='ended',ended_at=coalesce(ended_at,now()),end_reason=coalesce(nullif(trim(_reason),''),'ended_by_host')
  where s.id=_session
    and s.status in ('scheduled','live')
    and public.is_creator_of_channel(auth.uid(),s.channel_id);
  if not found then raise exception 'live_not_found'; end if;
end;
$phase7$;

revoke all on function public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.heartbeat_live(uuid) from public,anon,authenticated;
revoke all on function public.end_live(uuid,text) from public,anon,authenticated;
grant execute on function public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid) to authenticated;
grant execute on function public.heartbeat_live(uuid) to authenticated;
grant execute on function public.end_live(uuid,text) to authenticated;
