
create or replace function public.get_fan_crm(_channel uuid,_limit integer default 100)
returns table(
  fan_id uuid,
  pseudonym text,
  subscriptions bigint,
  purchases bigint,
  last_purchase_at timestamptz,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    x.fan_id,
    x.pseudonym,
    x.subscriptions,
    x.purchases,
    x.last_purchase_at,
    x.last_message_at
  from (
    select
      p.id fan_id,
      p.handle::text pseudonym,
      coalesce((
        select count(*)
        from public.subscriptions s
        where s.channel_id=_channel
          and s.subscriber_id=p.id
          and s.status='active'
          and s.current_period_end>now()
      ),0)::bigint subscriptions,
      coalesce((
        select count(*)
        from public.ledger_entries l
        where l.owner_id=p.id
          and l.amount<0
          and l.account='wallet'
          and l.metadata->>'channel_id'=_channel::text
      ),0)::bigint purchases,
      (
        select max(l.created_at)
        from public.ledger_entries l
        where l.owner_id=p.id
          and l.amount<0
          and l.account='wallet'
          and l.metadata->>'channel_id'=_channel::text
      ) last_purchase_at,
      (
        select max(m.created_at)
        from public.conversations cv
        join public.messages m on m.conversation_id=cv.id
        where cv.channel_id=_channel
          and cv.client_id=p.id
      ) last_message_at
    from public.profiles p
    where exists(
      select 1
      from public.subscriptions s
      where s.channel_id=_channel
        and s.subscriber_id=p.id
    )
  ) x
  where public.is_creator_of_channel((select auth.uid()),_channel)
  order by x.last_purchase_at desc nulls last,x.pseudonym
  limit greatest(1,least(_limit,500))
$$;

create or replace function public.get_fan_ranking(_channel uuid,_limit integer default 20)
returns table(rank integer,pseudonym text)
language sql
stable
security definer
set search_path=public
as $$
  select f.rank,p.handle::text
  from public.fan_rankings_weekly f
  join public.profiles p on p.id=f.user_id
  where f.channel_id=_channel
    and f.week_start=date_trunc('week',(now() at time zone 'Africa/Maputo')::date)::date
    and not p.fan_ranking_opt_out
    and public.is_age_verified((select auth.uid()))
  order by f.rank
  limit greatest(1,least(_limit,100))
$$;

create or replace function public.get_creator_analytics(_channel uuid,_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  rows jsonb;
  day_mz date:=(now() at time zone 'Africa/Maputo')::date;
begin
  if not public.is_creator_of_channel((select auth.uid()),_channel) then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day desc),'[]'::jsonb)
  into rows
  from (
    select
      day,views,unique_viewers,messages,sales,gross_amount,tips,live_minutes,
      new_subscribers,active_subscribers,followers,comments,reactions
    from public.creator_analytics_daily
    where channel_id=_channel
      and day>=day_mz-greatest(1,least(_days,365))
    order by day desc
  ) x;
  return rows;
end
$$;
