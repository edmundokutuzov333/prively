-- Phase E2E: production PPV purchase contract.
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
  existing uuid;
  purchase_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _post is null or nullif(trim(_idem),'') is null then raise exception 'invalid_ppv_request'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;

  select ppv_purchases.id into existing
  from public.ppv_purchases
  where buyer_id=auth.uid() and post_id=_post;
  if existing is not null then return existing; end if;

  select * into p
  from public.posts
  where id=_post and status='published'
  for share;

  if not found then raise exception 'post_not_found'; end if;
  if p.visibility <> 'ppv' or p.price is null or p.price <= 0 then raise exception 'ppv_not_available'; end if;

  perform public._spend_on_channel(
    auth.uid(),
    p.channel_id,
    p.price,
    'ppv',
    'post',
    p.id,
    'ppv:'||p.id::text||':'||trim(_idem)
  );

  insert into public.ppv_purchases(buyer_id,post_id,price_paid,txn_id)
  select auth.uid(),p.id,p.price,l.txn_id
  from public.ledger_entries l
  where l.owner_id=auth.uid()
    and l.account='wallet'
    and l.ref_type='post'
    and l.ref_id=p.id
    and l.kind='ppv'
  order by l.created_at desc
  limit 1
  returning id into purchase_id;

  if purchase_id is null then
    raise exception 'ppv_purchase_record_failed';
  end if;

  return purchase_id;
end
$function$;

revoke all on function public.purchase_ppv(uuid,text) from public,anon;
grant execute on function public.purchase_ppv(uuid,text) to authenticated;
