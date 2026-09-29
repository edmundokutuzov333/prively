
-- Fase 9 precision lifecycle: exact channel attribution, Maputo day boundaries,
-- refund-aware fan ranking and safer recommendation visibility.

create or replace function public._release_escrow(_eid uuid,_source text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.escrow_records;
  ch uuid;
  rate numeric;
  fee bigint;
  net bigint;
  rr bigint;
  txn uuid:=gen_random_uuid();
  hold_hours integer;
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;

  select case e.source_type
    when 'custom_request' then (select channel_id from public.custom_requests where id=e.source_id)
    when 'product' then (select channel_id from public.orders where id=e.source_id)
    when 'auction' then (select channel_id from public.auctions where id=e.source_id)
    else null
  end into ch;

  if ch is null then
    select id into ch from public.channels where owner_id=e.beneficiary_id order by created_at limit 1;
  end if;
  if ch is null then raise exception 'beneficiary_channel_not_found'; end if;

  rate:=public.commission_rate(ch,e.source_type);
  fee:=round(e.amount*rate);
  rr:=public.referral_reward(e.beneficiary_id,fee);
  net:=e.amount-fee;
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_release',e.source_type,e.source_id,null,
      jsonb_build_object('escrow_id',e.id,'channel_id',ch)),
    (txn,'creator_pending',e.beneficiary_id,net,'escrow_release',e.source_type,e.source_id,now()+make_interval(hours=>hold_hours),
      jsonb_build_object('commission',fee,'commission_rate',rate,'channel_id',ch)),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',e.source_type,e.source_id,null,
      jsonb_build_object('commission',fee,'commission_rate',rate,'referral_reward',rr,'channel_id',ch));

  if rr>0 then
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
    select txn,'creator_pending',r.referrer_id,rr,'referral',e.source_type,e.source_id,now()+make_interval(hours=>hold_hours),
      jsonb_build_object('referral_for_creator',e.beneficiary_id,'channel_id',ch)
    from public.referrals r
    where r.referred_id=e.beneficiary_id and r.status='active'
    limit 1;
  end if;

  update public.escrow_records
  set status='released',resolved_txn=txn,resolved_at=now()
  where id=_eid;
  return txn;
end
$$;

create or replace function public.refresh_creator_analytics()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  day_mz date := (now() at time zone 'Africa/Maputo')::date;
  start_ts timestamptz := ((day_mz::timestamp) at time zone 'Africa/Maputo');
  end_ts timestamptz := (((day_mz + 1)::timestamp) at time zone 'Africa/Maputo');
begin
  insert into public.creator_analytics_daily(
    channel_id,day,views,unique_viewers,messages,sales,gross_amount,tips,live_minutes,
    new_subscribers,active_subscribers,followers,comments,reactions
  )
  select
    c.id,
    day_mz,
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=start_ts and a.occurred_at<end_ts),0),
    coalesce((select count(distinct a.user_id) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=start_ts and a.occurred_at<end_ts),0),
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='message_sent' and a.occurred_at>=start_ts and a.occurred_at<end_ts),0),
    coalesce((
      select count(distinct l.txn_id)
      from public.ledger_entries l
      where l.account='creator_pending'
        and l.created_at>=start_ts and l.created_at<end_ts
        and l.amount>0
        and l.kind not in ('commission','referral')
        and l.metadata->>'channel_id'=c.id::text
    ),0),
    coalesce((
      select sum(l.amount)
      from public.ledger_entries l
      where l.account='creator_pending'
        and l.created_at>=start_ts and l.created_at<end_ts
        and l.amount>0
        and l.kind not in ('commission','referral')
        and l.metadata->>'channel_id'=c.id::text
    ),0),
    coalesce((
      select sum(l.amount)
      from public.ledger_entries l
      where l.account='creator_pending'
        and l.kind='tip'
        and l.amount>0
        and l.created_at>=start_ts and l.created_at<end_ts
        and l.metadata->>'channel_id'=c.id::text
    ),0),
    coalesce((
      select sum(extract(epoch from(l.ended_at-l.started_at))/60)
      from public.live_sessions l
      where l.channel_id=c.id and l.status='ended' and l.started_at>=start_ts and l.started_at<end_ts
    ),0),
    coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.created_at>=start_ts and s.created_at<end_ts),0),
    coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.status='active' and s.current_period_end>now()),0),
    coalesce((select count(*) from public.follows f where f.channel_id=c.id),0),
    coalesce((select count(*) from public.comments cm join public.posts po on po.id=cm.post_id where po.channel_id=c.id and cm.created_at>=start_ts and cm.created_at<end_ts),0),
    coalesce((select count(*) from public.reactions rx join public.posts po on po.id=rx.post_id where po.channel_id=c.id and rx.created_at>=start_ts and rx.created_at<end_ts),0)
  from public.channels c
  on conflict(channel_id,day) do update set
    views=excluded.views,
    unique_viewers=excluded.unique_viewers,
    messages=excluded.messages,
    sales=excluded.sales,
    gross_amount=excluded.gross_amount,
    tips=excluded.tips,
    live_minutes=excluded.live_minutes,
    new_subscribers=excluded.new_subscribers,
    active_subscribers=excluded.active_subscribers,
    followers=excluded.followers,
    comments=excluded.comments,
    reactions=excluded.reactions;
end
$$;

create or replace function public.refresh_rankings()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  week_start date := date_trunc('week',(now() at time zone 'Africa/Maputo')::date)::date;
  week_start_ts timestamptz := ((week_start::timestamp) at time zone 'Africa/Maputo');
  creator_count integer:=0;
begin
  delete from public.creator_rankings_weekly where week_start=week_start;

  with metrics as (
    select c.id channel_id,
      coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.status='active' and s.created_at>=week_start_ts),0)::bigint new_subscribers,
      coalesce((select count(*) from public.follows f where f.channel_id=c.id and f.created_at>=week_start_ts),0)::bigint new_follows,
      coalesce((select count(*) from public.comments cm join public.posts po on po.id=cm.post_id where po.channel_id=c.id and cm.created_at>=week_start_ts),0)::bigint comments,
      coalesce((select count(*) from public.reactions rx join public.posts po on po.id=rx.post_id where po.channel_id=c.id and rx.created_at>=week_start_ts),0)::bigint reactions,
      coalesce((select count(*) from public.posts po where po.channel_id=c.id and po.status='published' and po.created_at>=week_start_ts),0)::bigint new_posts
    from public.channels c
  )
  insert into public.creator_rankings_weekly(week_start,channel_id,rank,score,score_components)
  select week_start,
    channel_id,
    row_number() over(order by (new_subscribers*100 + new_follows*20 + comments*5 + reactions*2 + new_posts*3) desc,channel_id),
    (new_subscribers*100 + new_follows*20 + comments*5 + reactions*2 + new_posts*3),
    jsonb_build_object(
      'new_subscribers',new_subscribers,
      'new_follows',new_follows,
      'comments',comments,
      'reactions',reactions,
      'new_posts',new_posts
    )
  from metrics;

  get diagnostics creator_count=row_count;

  delete from public.fan_rankings_weekly where week_start=week_start;

  with spend as (
    select
      (l.metadata->>'channel_id')::uuid channel_id,
      l.owner_id user_id,
      sum(-l.amount)::bigint score
    from public.ledger_entries l
    where l.account='wallet'
      and l.amount<0
      and l.created_at>=week_start_ts
      and l.metadata ? 'channel_id'
      and not (
        l.kind='escrow_hold'
        and exists(
          select 1 from public.escrow_records e
          where e.held_txn=l.txn_id and e.status='refunded'
        )
      )
    group by (l.metadata->>'channel_id')::uuid,l.owner_id
  )
  insert into public.fan_rankings_weekly(week_start,channel_id,user_id,rank,score)
  select week_start,channel_id,user_id,
    row_number() over(partition by channel_id order by score desc,user_id),
    score
  from spend s
  join public.profiles p on p.id=s.user_id
  where not p.fan_ranking_opt_out;

  perform public.phase8_audit(
    'rankings_refreshed',
    'ranking',
    null,
    'Rankings recalculados no fuso Africa/Maputo',
    jsonb_build_object('week_start',week_start,'creator_channels',creator_count)
  );
end
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
  order by f.rank
  limit greatest(1,least(_limit,100));
$$;

create or replace function public.recommend_channels(_limit integer default 20)
returns table(channel_id uuid,handle text,display_name text,reason text)
language sql
stable
security definer
set search_path=public
as $$
  with me as (
    select * from public.profiles where id=(select auth.uid())
  ),
  candidates as (
    select
      c.id,
      c.handle::text handle,
      c.display_name,
      (
        case when c.id in (select channel_id from public.follows where follower_id=(select auth.uid())) then -100 else 0 end +
        case when c.city is not null and c.city=(select city from me) then 35 else 0 end +
        case when exists(
          select 1 from public.featured_channels f
          where f.channel_id=c.id and f.status='active' and f.starts_at<=now() and f.ends_at>now()
        ) then 100 else 0 end +
        coalesce((
          select sum(a.new_subscribers*5+a.followers+a.comments*2+a.reactions)
          from public.creator_analytics_daily a
          where a.channel_id=c.id and a.day>=((now() at time zone 'Africa/Maputo')::date-7)
        ),0) +
        coalesce((
          select count(*) from public.posts p
          where p.channel_id=c.id and p.status='published'
            and p.created_at>=now()-interval '7 days'
        )*2,0) +
        coalesce((
          select count(*) from public.recommendation_events r
          where r.user_id=(select auth.uid()) and r.channel_id=c.id and r.event_type='not_interested'
        )*(-200),0)
      ) score,
      case
        when exists(
          select 1 from public.featured_channels f
          where f.channel_id=c.id and f.status='active' and f.starts_at<=now() and f.ends_at>now()
        ) then 'destaque'
        when c.city is not null and c.city=(select city from me) then 'na tua cidade'
        else 'actividade recente'
      end reason
    from public.channels c
    join public.profiles owner on owner.id=c.owner_id and owner.status='active'
    where c.owner_id<>(select auth.uid())
      and public.is_age_verified((select auth.uid()))
  )
  select id,handle,display_name,reason
  from candidates
  order by score desc,id
  limit greatest(1,least(_limit,50));
$$;

create or replace function public.get_featured_channels(_limit integer default 20)
returns table(channel_id uuid,handle text,display_name text,placement text)
language sql
stable
security definer
set search_path=public
as $$
  select f.channel_id,c.handle::text,c.display_name,f.placement
  from public.featured_channels f
  join public.channels c on c.id=f.channel_id
  join public.profiles p on p.id=c.owner_id and p.status='active'
  where f.status='active'
    and f.starts_at<=now()
    and f.ends_at>now()
    and public.is_age_verified((select auth.uid()))
  order by f.starts_at desc
  limit greatest(1,least(_limit,50))
$$;

create or replace function public.record_recommendation_event(_channel uuid,_event_type text)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare id bigint;
begin
  if not public.is_age_verified((select auth.uid())) then raise exception 'age_not_verified'; end if;
  if _event_type not in ('impression','open','follow','subscribe','purchase','hide','not_interested') then
    raise exception 'invalid_recommendation_event';
  end if;
  insert into public.recommendation_events(user_id,channel_id,event_type)
  values((select auth.uid()),_channel,_event_type)
  returning recommendation_events.id into id;
  return id;
end
$$;
