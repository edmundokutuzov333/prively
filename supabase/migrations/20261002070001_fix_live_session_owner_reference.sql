-- Fix ambiguous owner_id reference in creator live session creation.
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
language plpgsql
security definer
set search_path=public
as $phase7$
declare
  id uuid:=gen_random_uuid();
  owner_id uuid;
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

  select ch.owner_id into owner_id from public.channels ch where ch.id=_channel;

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

revoke all on function public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid) to authenticated;
