-- Phase 10: PPV runtime hardening.
-- Forward-only. No demo data.

create or replace function public.purchase_ppv(
  _post uuid,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public, pg_temp
as $function$
declare
  p public.posts;
  existing_purchase uuid;
  purchase_id uuid;
  txn_id uuid;
  lock_key bigint;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _post is null or nullif(trim(_idem),'') is null or char_length(trim(_idem)) > 128 then
    raise exception 'invalid_ppv_request';
  end if;

  if not public.is_age_verified(auth.uid()) then
    raise exception 'age_not_verified';
  end if;

  /*
   * Serialize PPV purchases per buyer/post. The client normally sends a
   * unique _idem on every click, so idempotency alone cannot prevent two
   * concurrent clicks from both reaching _spend_on_channel(). The advisory
   * transaction lock closes that race without introducing a persistent lock
   * table.
   */
  lock_key := hashtextextended(
    'prively:ppv:' || auth.uid()::text || ':' || _post::text,
    0
  );
  perform pg_advisory_xact_lock(lock_key);

  select id
    into existing_purchase
  from public.ppv_purchases
  where buyer_id = auth.uid()
    and post_id = _post
  for update;

  if existing_purchase is not null then
    return existing_purchase;
  end if;

  select *
    into p
  from public.posts
  where id = _post
    and status = 'published'
  for share;

  if not found then
    raise exception 'post_not_found';
  end if;

  if p.visibility <> 'ppv' or p.price is null or p.price <= 0 then
    raise exception 'ppv_not_available';
  end if;

  txn_id := public._spend_on_channel(
    auth.uid(),
    p.channel_id,
    p.price,
    'ppv',
    'post',
    p.id,
    'ppv:' || p.id::text || ':' || trim(_idem)
  );

  insert into public.ppv_purchases(
    buyer_id,
    post_id,
    price_paid,
    txn_id
  )
  values (
    auth.uid(),
    p.id,
    p.price,
    txn_id
  )
  returning id into purchase_id;

  return purchase_id;
end
$function$;

revoke all on function public.purchase_ppv(uuid,text) from public, anon;
grant execute on function public.purchase_ppv(uuid,text) to authenticated;

revoke insert, update, delete on table public.ppv_purchases from authenticated;
grant select on table public.ppv_purchases to authenticated;
