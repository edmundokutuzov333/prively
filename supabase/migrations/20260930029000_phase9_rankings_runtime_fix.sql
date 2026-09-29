
create or replace function public.refresh_rankings()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_week_start date := date_trunc('week',(now() at time zone 'Africa/Maputo')::date)::date;
  v_week_start_ts timestamptz := ((v_week_start::timestamp) at time zone 'Africa/Maputo');
  v_creator_count integer:=0;
begin
  delete from public.creator_rankings_weekly r
  where r.week_start=v_week_start;

  with metrics as (
    select
      c.id channel_id,
      coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.status='active' and s.created_at>=v_week_start_ts),0)::bigint new_subscribers,
      coalesce((select count(*) from public.follows f where f.channel_id=c.id and f.created_at>=v_week_start_ts),0)::bigint new_follows,
      coalesce((select count(*) from public.comments cm join public.posts po on po.id=cm.post_id where po.channel_id=c.id and cm.created_at>=v_week_start_ts),0)::bigint comments,
      coalesce((select count(*) from public.reactions rx join public.posts po on po.id=rx.post_id where po.channel_id=c.id and rx.created_at>=v_week_start_ts),0)::bigint reactions,
      coalesce((select count(*) from public.posts po where po.channel_id=c.id and po.status='published' and po.created_at>=v_week_start_ts),0)::bigint new_posts
    from public.channels c
  )
  insert into public.creator_rankings_weekly(
    week_start,channel_id,rank,score,score_components
  )
  select
    v_week_start,
    m.channel_id,
    row_number() over(order by (m.new_subscribers*100 + m.new_follows*20 + m.comments*5 + m.reactions*2 + m.new_posts*3) desc,m.channel_id),
    (m.new_subscribers*100 + m.new_follows*20 + m.comments*5 + m.reactions*2 + m.new_posts*3),
    jsonb_build_object(
      'new_subscribers',m.new_subscribers,
      'new_follows',m.new_follows,
      'comments',m.comments,
      'reactions',m.reactions,
      'new_posts',m.new_posts
    )
  from metrics m;

  get diagnostics v_creator_count=row_count;

  delete from public.fan_rankings_weekly fr
  where fr.week_start=v_week_start;

  with spend as (
    select
      (l.metadata->>'channel_id')::uuid channel_id,
      l.owner_id user_id,
      sum(-l.amount)::bigint score
    from public.ledger_entries l
    where l.account='wallet'
      and l.amount<0
      and l.created_at>=v_week_start_ts
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
  insert into public.fan_rankings_weekly(
    week_start,channel_id,user_id,rank,score
  )
  select
    v_week_start,
    s.channel_id,
    s.user_id,
    row_number() over(partition by s.channel_id order by s.score desc,s.user_id),
    s.score
  from spend s
  join public.profiles p on p.id=s.user_id
  where not p.fan_ranking_opt_out;

  perform public.phase8_audit(
    'rankings_refreshed',
    'ranking',
    null,
    'Rankings recalculados no fuso Africa/Maputo',
    jsonb_build_object('week_start',v_week_start,'creator_channels',v_creator_count)
  );
end
$$;
