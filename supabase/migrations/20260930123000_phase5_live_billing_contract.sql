alter table public.live_sessions drop constraint if exists live_sessions_mode_check;
alter table public.live_sessions add constraint live_sessions_mode_check check(mode in ('free','paid','private'));
alter table public.live_sessions add column if not exists per_minute_price bigint;
alter table public.live_sessions add column if not exists private_client_id uuid references public.profiles;
alter table public.live_sessions add column if not exists last_heartbeat_at timestamptz;
alter table public.live_sessions add column if not exists end_reason text;

create table if not exists public.live_participants(
  session_id uuid not null references public.live_sessions on delete cascade,
  participant_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  status text not null default 'active' check(status in ('active','left','ended_insufficient_funds')),
  primary key(session_id,participant_id)
);
create table if not exists public.live_billing_ticks(
  session_id uuid not null references public.live_sessions on delete cascade,
  payer_id uuid not null references public.profiles,
  minute_index integer not null check(minute_index>0),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  primary key(session_id,payer_id,minute_index)
);
create table if not exists public.live_enforcement_actions(
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions on delete cascade,
  participant_id uuid not null references public.profiles,
  action text not null check(action='remove_participant'),
  status text not null default 'pending' check(status in ('pending','done','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create table if not exists public.livekit_events(
  event_id text primary key,
  event_type text not null,
  room_name text,
  received_at timestamptz not null default now()
);
alter table public.live_billing_ticks enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_enforcement_actions enable row level security;
revoke all on public.live_billing_ticks,public.live_enforcement_actions from anon,authenticated;

create or replace function public.charge_active_live_minutes()
returns integer language plpgsql security definer set search_path=public as $function$
declare p record; minute_no integer; inserted integer; charged integer:=0; txn_id uuid;
begin
  for p in select lp.session_id,lp.participant_id,lp.joined_at,ls.channel_id,coalesce(ls.per_minute_price,0) price from public.live_participants lp join public.live_sessions ls on ls.id=lp.session_id where lp.status='active' and lp.left_at is null and ls.status='live' and coalesce(ls.per_minute_price,0)>0 for update of lp skip locked loop
    minute_no:=floor(extract(epoch from(now()-p.joined_at))/60)::integer+1;
    insert into public.live_billing_ticks(session_id,payer_id,minute_index,amount) values(p.session_id,p.participant_id,minute_no,p.price) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=0 then continue; end if;
    begin
      txn_id:=public._spend_on_channel(p.participant_id,p.channel_id,p.price,'live_minute','live_session',p.session_id,'live:'||p.session_id::text||':'||p.participant_id::text||':'||minute_no::text);
      charged:=charged+1;
    exception when others then
      update public.live_participants set status='ended_insufficient_funds',left_at=now() where session_id=p.session_id and participant_id=p.participant_id;
      insert into public.live_enforcement_actions(session_id,participant_id,action) values(p.session_id,p.participant_id,'remove_participant');
    end;
  end loop;
  return charged;
end
$function$;
revoke all on function public.charge_active_live_minutes() from public,anon,authenticated;
grant execute on function public.charge_active_live_minutes() to service_role;

do $$ begin
  if to_regnamespace('cron') is not null then perform cron.schedule('prively-live-billing','* * * * *','select public.charge_active_live_minutes();'); end if;
  if to_regnamespace('vault') is not null and not exists(select 1 from vault.secrets where name='prively_live_enforcer_token') then perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'prively_live_enforcer_token'); end if;
end $$;
