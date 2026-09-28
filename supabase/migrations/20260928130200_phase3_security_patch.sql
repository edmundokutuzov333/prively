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


create unique index if not exists ledger_release_source_unique_idx
on public.ledger_entries(release_source_id)
where release_source_id is not null;

create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare p public.posts; c public.channels;
begin
  select * into p from public.posts where id=_post_id and status='published'
    and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now());
  if not found then return false; end if;
  select * into c from public.channels where id=p.channel_id;
  if _uid=c.owner_id then return true; end if;
  if not public.is_age_verified(_uid) then return false; end if;
  if exists(select 1 from public.blocks where (owner_id=c.owner_id and blocked_user_id=_uid) or (owner_id=_uid and blocked_user_id=c.owner_id)) then return false; end if;
  if exists(select 1 from public.hidden_from where channel_id=c.id and user_id=_uid) then return false; end if;
  return case p.visibility
    when 'public' then true
    when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
      or exists(select 1 from public.bundle_purchases bp join public.bundle_items bi on bi.bundle_id=bp.bundle_id where bp.buyer_id=_uid and bi.post_id=p.id)
    else false
  end;
end $$;


create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare h text;
begin
  h:=lower(trim(coalesce(new.raw_user_meta_data->>'handle','')));
  if h !~ '^[a-z0-9_]{3,24}$' then h:='priv_'||replace(left(new.id::text,18),'-',''); end if;
  insert into public.profiles(id,handle,display_name)
  values(new.id,h,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),h))
  on conflict(id) do nothing;
  insert into public.user_roles(user_id,role) values(new.id,'client') on conflict do nothing;
  insert into public.balances(owner_id,account,balance)
  values
    (new.id,'wallet',0),
    (new.id,'creator_pending',0),
    (new.id,'creator_available',0)
  on conflict(owner_id,account) do nothing;
  return new;
end $$;

insert into public.balances(owner_id,account,balance)
select p.id, a.account, 0
from public.profiles p
cross join (values
  ('wallet'::public.ledger_account),
  ('creator_pending'::public.ledger_account),
  ('creator_available'::public.ledger_account)
) a(account)
on conflict(owner_id,account) do nothing;
