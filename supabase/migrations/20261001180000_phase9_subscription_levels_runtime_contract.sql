-- Phase 9: subscription levels runtime hardening.
-- Reuse the production subscription schema. No duplicate tables are created.
-- All financial decisions remain server-side and idempotent.

alter table public.subscription_tiers enable row level security;
alter table public.subscriptions enable row level security;

revoke all on public.subscription_tiers from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscription_tiers to anon, authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists tiers_read on public.subscription_tiers;
create policy tiers_read
on public.subscription_tiers
for select
to anon, authenticated
using (true);

drop policy if exists subscriptions_parties on public.subscriptions;
create policy subscriptions_parties
on public.subscriptions
for select
to authenticated
using (
  subscriber_id = auth.uid()
  or public.is_creator_of_channel(auth.uid(), channel_id)
);

create or replace function public.upsert_subscription_tier(
  _channel uuid,
  _name text,
  _rank smallint,
  _price_month bigint,
  _discounts jsonb default '{"1":0,"3":0.15,"6":0.25,"12":0.40}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_discounts jsonb;
  v_allowed_name text;
  v_rank_name text;
  v_discount numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _channel is null then raise exception 'channel_not_found'; end if;
  if not public.is_creator_of_channel(auth.uid(), _channel) then raise exception 'channel_forbidden'; end if;
  if _rank not between 1 and 4 then raise exception 'tier_rank_invalid'; end if;

  v_rank_name := case _rank
    when 1 then 'Bronze'
    when 2 then 'Prata'
    when 3 then 'Ouro'
    when 4 then 'VIP'
  end;
  v_allowed_name := initcap(trim(coalesce(_name, '')));
  if v_allowed_name <> v_rank_name then raise exception 'tier_name_invalid'; end if;
  if _price_month <= 0 then raise exception 'tier_price_invalid'; end if;

  v_discounts := coalesce(_discounts, '{}'::jsonb);
  if jsonb_typeof(v_discounts) <> 'object' then raise exception 'tier_discounts_invalid'; end if;

  foreach v_discount in array array[
    coalesce((v_discounts ->> '1')::numeric, 0),
    coalesce((v_discounts ->> '3')::numeric, 0),
    coalesce((v_discounts ->> '6')::numeric, 0),
    coalesce((v_discounts ->> '12')::numeric, 0)
  ] loop
    if v_discount < 0 or v_discount > 0.90 then raise exception 'tier_discounts_invalid'; end if;
  end loop;

  if coalesce((v_discounts ->> '1')::numeric, 0) <> 0 then
    raise exception 'tier_one_month_discount_invalid';
  end if;

  v_discounts := jsonb_build_object(
    '1', 0,
    '3', coalesce((v_discounts ->> '3')::numeric, 0),
    '6', coalesce((v_discounts ->> '6')::numeric, 0),
    '12', coalesce((v_discounts ->> '12')::numeric, 0)
  );

  insert into public.subscription_tiers(channel_id,name,rank,price_month,discounts)
  values(_channel,v_rank_name,_rank,_price_month,v_discounts)
  on conflict(channel_id,rank)
  do update set
    name=excluded.name,
    price_month=excluded.price_month,
    discounts=excluded.discounts
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.upsert_subscription_tier(uuid,text,smallint,bigint,jsonb)
from public, anon, authenticated;
grant execute on function public.upsert_subscription_tier(uuid,text,smallint,bigint,jsonb)
to authenticated;

create or replace function public.subscribe_to_tier(
  _tier uuid,
  _period_months smallint,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  t public.subscription_tiers;
  c public.channels;
  s public.subscriptions;
  base bigint;
  discount numeric;
  price bigint;
  spend_txn uuid;
  end_at timestamptz;
  action_key text;
  existing_result uuid;
  action_txn uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  if _period_months not in (1,3,6,12) then raise exception 'invalid_period'; end if;
  if _idem is null or char_length(trim(_idem)) < 8 or char_length(_idem) > 128 then
    raise exception 'idempotency_key_required';
  end if;

  action_key := 'subscription-action:' || _tier::text || ':' || _period_months::text || ':' || trim(_idem);

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(auth.uid(),action_key,gen_random_uuid())
  on conflict(owner_id,key) do nothing;

  select result_id,txn_id into existing_result,action_txn
  from public.idempotency_keys
  where owner_id=auth.uid() and key=action_key
  for update;

  if existing_result is not null then return existing_result; end if;

  select * into t from public.subscription_tiers where id=_tier for share;
  if not found then raise exception 'tier_not_found'; end if;

  select * into c from public.channels where id=t.channel_id for update;
  if not found then raise exception 'channel_not_found'; end if;
  if c.owner_id=auth.uid() then raise exception 'self_subscription_not_allowed'; end if;

  select * into s from public.subscriptions
  where subscriber_id=auth.uid() and channel_id=c.id
  for update;

  base := t.price_month * _period_months;
  discount := coalesce((t.discounts ->> _period_months::text)::numeric,0);
  if discount < 0 or discount > 0.90 then raise exception 'tier_discounts_invalid'; end if;

  price := round(base * (1-discount));
  if price <= 0 then raise exception 'tier_price_invalid'; end if;

  spend_txn := public._spend_on_channel(
    auth.uid(),c.id,price,'subscription','tier',t.id,'subscription-spend:' || action_key
  );

  if s.id is null then
    end_at := now() + make_interval(months => _period_months);
    insert into public.subscriptions(
      subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,auto_renew,status
    )
    values(auth.uid(),c.id,t.id,_period_months,price,end_at,true,'active')
    returning * into s;
  else
    end_at := greatest(now(),s.current_period_end) + make_interval(months => _period_months);
    update public.subscriptions
    set tier_id=t.id,
        period_months=_period_months,
        price_paid=price,
        current_period_end=end_at,
        auto_renew=true,
        status='active',
        past_due_at=null,
        renewal_attempts=0
    where id=s.id
    returning * into s;
  end if;

  update public.idempotency_keys
  set result_id=s.id,result_type='subscription',txn_id=spend_txn
  where owner_id=auth.uid() and key=action_key;

  return s.id;
end;
$function$;

revoke all on function public.subscribe_to_tier(uuid,smallint,text)
from public, anon, authenticated;
grant execute on function public.subscribe_to_tier(uuid,smallint,text)
to authenticated;

create or replace function public.cancel_subscription(_subscription uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  update public.subscriptions
  set auto_renew=false
  where id=_subscription and subscriber_id=auth.uid();

  if not found then raise exception 'subscription_not_found'; end if;
end;
$function$;

revoke all on function public.cancel_subscription(uuid)
from public, anon, authenticated;
grant execute on function public.cancel_subscription(uuid)
to authenticated;

revoke all on function public.has_active_subscription(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.has_active_subscription(uuid,uuid)
to service_role;

revoke all on function public.has_tier_rank(uuid,uuid,smallint)
from public, anon, authenticated;
grant execute on function public.has_tier_rank(uuid,uuid,smallint)
to service_role;

create or replace function public.renew_due_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  s public.subscriptions;
  tier public.subscription_tiers;
  base bigint;
  discount numeric;
  price bigint;
  idem text;
  extended_end timestamptz;
  renewed integer := 0;
begin
  update public.subscriptions
  set status='expired'
  where status='active'
    and auto_renew=false
    and current_period_end <= now();

  update public.subscriptions
  set status='expired',
      auto_renew=false,
      renewal_attempts=renewal_attempts+1
  where status='past_due'
    and past_due_at is not null
    and past_due_at < now()-interval '3 days';

  for s in
    select *
    from public.subscriptions
    where auto_renew=true
      and status in ('active','past_due')
      and current_period_end <= now()
      and (past_due_at is null or past_due_at >= now()-interval '3 days')
    order by current_period_end
    for update skip locked
  loop
    begin
      select * into tier from public.subscription_tiers where id=s.tier_id;
      if not found then raise exception 'tier_not_found'; end if;

      base := tier.price_month * s.period_months;
      discount := coalesce((tier.discounts ->> s.period_months::text)::numeric,0);
      if discount < 0 or discount > 0.90 then raise exception 'tier_discounts_invalid'; end if;

      price := round(base * (1-discount));
      if price <= 0 then raise exception 'tier_price_invalid'; end if;

      idem := 'renew:'||s.id::text||':'||to_char(s.current_period_end,'YYYYMMDDHH24MISS');

      perform public._spend_on_channel(
        s.subscriber_id,s.channel_id,price,'subscription','subscription',s.id,idem
      );

      extended_end := greatest(now(),s.current_period_end) + make_interval(months=>s.period_months);

      update public.subscriptions
      set status='active',
          current_period_end=extended_end,
          past_due_at=null,
          renewal_attempts=renewal_attempts+1
      where id=s.id;

      renewed := renewed+1;
    exception when others then
      if now() <= s.current_period_end + interval '3 days' then
        update public.subscriptions
        set status='past_due',
            past_due_at=coalesce(past_due_at,now()),
            renewal_attempts=renewal_attempts+1
        where id=s.id;
      else
        update public.subscriptions
        set status='expired',
            auto_renew=false,
            renewal_attempts=renewal_attempts+1
        where id=s.id;
      end if;
    end;
  end loop;

  return renewed;
end;
$function$;

revoke all on function public.renew_due_subscriptions()
from public, anon, authenticated;
grant execute on function public.renew_due_subscriptions()
to service_role;

do $$
begin
  begin
    perform cron.unschedule('prively-renew-subscriptions');
  exception when others then null;
  end;
  perform cron.schedule('prively-renew-subscriptions','0 3 * * *','select public.renew_due_subscriptions();');
end
$$;
