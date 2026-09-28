-- Phase 6 hardening: idempotent subscription state transitions under concurrency

alter table public.idempotency_keys
  add column if not exists result_id uuid,
  add column if not exists result_type text;

create index if not exists idempotency_keys_result_idx
  on public.idempotency_keys(owner_id,result_type,result_id)
  where result_id is not null;

create or replace function public.subscribe_to_tier(
  _tier uuid,
  _period_months smallint,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
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
  if _period_months not in (1,3,6,12) then raise exception 'invalid_period'; end if;
  if _idem is null or char_length(trim(_idem))<8 or char_length(_idem)>128 then raise exception 'idempotency_key_required'; end if;

  action_key:='subscription-action:'||_tier::text||':'||_period_months::text||':'||trim(_idem);

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(auth.uid(),action_key,gen_random_uuid())
  on conflict(owner_id,key) do nothing;

  select result_id,txn_id
  into existing_result,action_txn
  from public.idempotency_keys
  where owner_id=auth.uid() and key=action_key
  for update;

  if existing_result is not null then
    return existing_result;
  end if;

  select * into t
  from public.subscription_tiers
  where id=_tier
  for share;

  if not found then raise exception 'tier_not_found'; end if;

  select * into c
  from public.channels
  where id=t.channel_id
  for update;

  if not found then raise exception 'channel_not_found'; end if;
  if c.owner_id=auth.uid() then raise exception 'self_subscription_not_allowed'; end if;

  select * into s
  from public.subscriptions
  where subscriber_id=auth.uid() and channel_id=c.id
  for update;

  base:=t.price_month*_period_months;
  discount:=coalesce((t.discounts->>_period_months::text)::numeric,0);
  price:=round(base*(1-discount));

  spend_txn:=public._spend_on_channel(
    auth.uid(),
    c.id,
    price,
    'subscription',
    'tier',
    t.id,
    'subscription-spend:'||action_key
  );

  if s.id is null then
    end_at:=now()+make_interval(months=>_period_months);
    insert into public.subscriptions(
      subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,auto_renew,status
    )
    values(auth.uid(),c.id,t.id,_period_months,price,end_at,true,'active')
    returning * into s;
  else
    end_at:=greatest(now(),s.current_period_end)+make_interval(months=>_period_months);
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
  set result_id=s.id,
      result_type='subscription',
      txn_id=spend_txn
  where owner_id=auth.uid()
    and key=action_key;

  return s.id;
end
$$;
