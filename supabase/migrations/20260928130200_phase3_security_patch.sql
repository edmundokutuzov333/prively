drop policy if exists posts_read on public.posts;
create policy posts_visible on public.posts
for select to authenticated
using(public.can_view_post(id,auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));

create or replace function public.subscribe(_tier uuid,_period smallint,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare t public.subscription_tiers; price bigint; txn uuid; id uuid:=gen_random_uuid(); discount numeric:=0;
begin
  if _period not in(1,3,6,12) then raise exception 'invalid_subscription_period'; end if;
  select * into t from public.subscription_tiers where id=_tier for update;
  if not found then raise exception 'tier_not_found'; end if;
  if t.channel_id is null then raise exception 'channel_not_found'; end if;
  discount:=coalesce((t.discounts->>(_period::text))::numeric,0);
  price:=round(t.price_month*_period*(1-discount));
  select s.id into id from public.subscriptions s where s.subscriber_id=auth.uid() and s.channel_id=t.channel_id and s.status='active' and s.current_period_end>now();
  if id is not null then raise exception 'subscription_already_active'; end if;
  txn:=public._spend_on_channel(auth.uid(),t.channel_id,price,'subscription','subscription_tier',t.id,'subscription:'||t.id::text||':'||_idem);
  insert into public.subscriptions(id,subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end)
  values(id,auth.uid(),t.channel_id,t.id,_period,price,now()+make_interval(months=>_period))
  on conflict(subscriber_id,channel_id) do update set tier_id=excluded.tier_id,period_months=excluded.period_months,price_paid=excluded.price_paid,current_period_end=excluded.current_period_end,status='active';
  return id;
end $$;

create or replace function public.purchase_ppv(_post uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.posts; id uuid:=gen_random_uuid(); txn uuid;
begin
  select * into p from public.posts where id=_post and visibility='ppv' and status='published' for update;
  if not found or p.price is null then raise exception 'ppv_not_available'; end if;
  if exists(select 1 from public.ppv_purchases where buyer_id=auth.uid() and post_id=_post) then
    select id into id from public.ppv_purchases where buyer_id=auth.uid() and post_id=_post;
    return id;
  end if;
  txn:=public._spend_on_channel(auth.uid(),p.channel_id,p.price,'ppv','post',p.id,'ppv:'||p.id::text||':'||_idem);
  insert into public.ppv_purchases(id,buyer_id,post_id,price_paid,txn_id) values(id,auth.uid(),p.id,p.price,txn);
  return id;
end $$;

create or replace function public.follow_channel(_channel uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  insert into public.follows(follower_id,channel_id) values(auth.uid(),_channel) on conflict do nothing;
  perform public.award_configured_points(auth.uid(),'follow','channel',_channel);
end $$;

grant execute on function public.subscribe(uuid,smallint,text) to authenticated;
grant execute on function public.purchase_ppv(uuid,text) to authenticated;
grant execute on function public.follow_channel(uuid) to authenticated;

create index if not exists ledger_release_source_idx on public.ledger_entries(release_source_id);
