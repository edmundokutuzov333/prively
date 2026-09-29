
-- Fase 9 security and contract hardening.

alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.custom_request_offers enable row level security;
alter table public.fan_tags enable row level security;
alter table public.fan_tag_assignments enable row level security;
alter table public.premium_features enable row level security;
alter table public.user_premium_features enable row level security;
alter table public.featured_channels enable row level security;
alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.channel_embeddings enable row level security;
alter table public.user_recommendation_profiles enable row level security;
alter table public.recommendation_events enable row level security;

drop policy if exists promotions_read on public.promotions;
create policy promotions_read on public.promotions
for select to authenticated
using (
  (active and starts_at<=now() and (ends_at is null or ends_at>now()) and is_age_verified(auth.uid()))
  or is_creator_of_channel(auth.uid(),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists promotions_admin on public.promotions;
create policy promotions_admin on public.promotions
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists promotion_redemptions_read on public.promotion_redemptions;
create policy promotion_redemptions_read on public.promotion_redemptions
for select to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.promotions p where p.id=promotion_id and is_creator_of_channel(auth.uid(),p.channel_id))
  or (select private.is_platform_admin())
);

drop policy if exists creator_goals_read on public.creator_goals;
create policy creator_goals_read on public.creator_goals
for select to authenticated
using (is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists creator_goals_insert on public.creator_goals;
create policy creator_goals_insert on public.creator_goals
for insert to authenticated
with check (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists creator_goals_update on public.creator_goals;
create policy creator_goals_update on public.creator_goals
for update to authenticated
using (is_creator_of_channel(auth.uid(),channel_id))
with check (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists creator_goals_delete on public.creator_goals;
create policy creator_goals_delete on public.creator_goals
for delete to authenticated
using (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists gifts_catalog_admin on public.gifts_catalog;
create policy gifts_catalog_admin on public.gifts_catalog
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists badges_admin on public.badges;
create policy badges_admin on public.badges
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists missions_admin on public.missions;
create policy missions_admin on public.missions
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists premium_features_admin on public.premium_features;
create policy premium_features_admin on public.premium_features
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists featured_channels_admin on public.featured_channels;
create policy featured_channels_admin on public.featured_channels
for all to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

create or replace function public.create_creator_goal(
  _channel uuid,_name text,_target bigint,_starts_at timestamptz,_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if _target<=0 or _ends_at<=_starts_at then raise exception 'invalid_goal'; end if;
  insert into public.creator_goals(id,channel_id,name,target_amount,starts_at,ends_at,status)
  values(id,_channel,trim(_name),_target,_starts_at,_ends_at,'active');
  return id;
end $$;

create or replace function public.update_goal_progress(_goal uuid)
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'goal_id',g.id,
    'name',g.name,
    'target_amount',g.target_amount,
    'starts_at',g.starts_at,
    'ends_at',g.ends_at,
    'status',g.status,
    'current_amount',
      coalesce((
        select sum(l.amount) from public.ledger_entries l
        join public.channels c on c.owner_id=l.owner_id
        where c.id=g.channel_id
          and l.account='creator_pending'
          and l.created_at>=g.starts_at
          and l.created_at<=g.ends_at
          and l.amount>0
          and l.kind<>'commission'
      ),0)
  )
  from public.creator_goals g
  where g.id=_goal
    and is_creator_of_channel(auth.uid(),g.channel_id)
$$;

create or replace function public.purchase_premium_feature(
  _feature uuid,_channel uuid default null,_idem text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare f public.premium_features; txn uuid; id uuid:=gen_random_uuid(); ends timestamptz; idem_key text;
platform constant uuid:='00000000-0000-0000-0000-000000000000';
existing_txn uuid; existing_id uuid;
begin
  select * into f from public.premium_features where id=_feature and active for update;
  if not found then raise exception 'premium_feature_unavailable'; end if;

  idem_key:='premium:'||f.id::text||':'||coalesce(nullif(trim(_idem),''),gen_random_uuid()::text);
  select txn_id into existing_txn from public.idempotency_keys where owner_id=auth.uid() and key=idem_key;
  if existing_txn is not null then
    select id into existing_id from public.user_premium_features where txn_id=existing_txn order by created_at desc limit 1;
    if existing_id is not null then return existing_id; end if;
  end if;

  if exists(select 1 from public.user_premium_features u where u.user_id=auth.uid() and u.feature_id=f.id and u.status='active' and u.ends_at>now()) then
    raise exception 'premium_feature_already_active';
  end if;

  if f.code='featured_creator' then
    if _channel is null or not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'channel_required'; end if;
  end if;

  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  perform public.assert_spend_limit(auth.uid(),f.price);

  txn:=gen_random_uuid();
  insert into public.idempotency_keys(owner_id,key,txn_id)
    values(auth.uid(),idem_key,txn)
    on conflict(owner_id,key) do nothing;

  select txn_id into txn from public.idempotency_keys where owner_id=auth.uid() and key=idem_key;
  if txn is null then raise exception 'idempotency_failed'; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'wallet',auth.uid(),-f.price,'premium','premium_feature',f.id,jsonb_build_object('feature',f.code,'channel_id',_channel)),
    (txn,'platform_revenue',platform,f.price,'premium','premium_feature',f.id,jsonb_build_object('feature',f.code,'channel_id',_channel));

  ends:=now()+make_interval(days=>f.duration_days);
  insert into public.user_premium_features(id,user_id,feature_id,starts_at,ends_at,txn_id)
    values(id,auth.uid(),f.id,now(),ends,txn);

  if f.code='featured_creator' then
    insert into public.featured_channels(channel_id,placement,starts_at,ends_at,status,approved_by,source)
      values(_channel,'discovery',now(),ends,'active',auth.uid(),'premium');
  end if;
  return id;
end $$;

create or replace function public._release_escrow(_eid uuid,_source text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare e public.escrow_records; ch uuid; rate numeric; fee bigint; net bigint; rr bigint; txn uuid:=gen_random_uuid(); hold_hours integer;
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;

  select id into ch from public.channels where owner_id=e.beneficiary_id order by created_at limit 1;
  if ch is null then raise exception 'beneficiary_channel_not_found'; end if;

  rate:=public.commission_rate(ch,e.source_type);
  fee:=round(e.amount*rate);
  rr:=public.referral_reward(e.beneficiary_id,fee);
  net:=e.amount-fee;
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_release',e.source_type,e.source_id,null,jsonb_build_object('escrow_id',e.id,'channel_id',ch)),
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
end $$;

create or replace function public.release_due_business_escrows()
returns integer language plpgsql security definer set search_path=public
as $$
declare e public.escrow_records; released_count integer:=0; hold_hours integer;
declare ready boolean;
declare release_error text;
begin
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);
  for e in
    select * from public.escrow_records
    where status='held'
      and created_at <= now()-make_interval(hours=>hold_hours)
      and source_type in ('custom_request','product')
    order by created_at
    for update skip locked
  loop
    ready:=case
      when e.source_type='custom_request'
        then exists(select 1 from public.custom_requests r where r.id=e.source_id and r.status='delivered')
      when e.source_type='product'
        then exists(select 1 from public.orders o where o.id=e.source_id and o.status='delivered')
      else false
    end;
    if ready then
      begin
        perform public._release_escrow(e.id,e.source_type);
        if e.source_type='custom_request' then
          update public.custom_requests set status='released' where id=e.source_id and status='delivered';
        else
          update public.orders set status='released' where id=e.source_id and status='delivered';
        end if;
        released_count:=released_count+1;
      exception when others then
        release_error:=sqlerrm;
        perform public.phase8_audit(
          'business_escrow_release_failed',
          e.source_type,
          e.source_id,
          release_error,
          jsonb_build_object('escrow_id',e.id,'sqlstate',sqlstate)
        );
      end;
    end if;
  end loop;
  return released_count;
end $$;

create or replace function public.respond_custom_request(
  _request uuid,_status text,_counter_budget bigint default null,_note text default null
) returns void language plpgsql security definer set search_path=public
as $$
declare r public.custom_requests; old_escrow uuid; offer_id uuid;
begin
  select * into r from public.custom_requests where id=_request for update;
  if not found or not public.is_creator_of_channel(auth.uid(),r.channel_id) then raise exception 'forbidden'; end if;

  if _status='accepted' then
    if r.status not in ('pending','countered') then raise exception 'invalid_request_state'; end if;
    update public.custom_requests set status='accepted',accepted_at=coalesce(accepted_at,now()),response_note=nullif(trim(_note),'') where id=r.id;
  elsif _status='declined' then
    if r.escrow_id is not null and exists(select 1 from public.escrow_records where id=r.escrow_id and status='held') then
      old_escrow:=r.escrow_id;
      perform public._refund_escrow(old_escrow);
    end if;
    update public.custom_requests set status='declined',response_note=nullif(trim(_note),'') where id=r.id;
    insert into public.notifications(user_id,kind,payload) values(r.client_id,'custom_request_declined',jsonb_build_object('request_id',r.id));
  elsif _status='countered' then
    if _counter_budget is null or _counter_budget<=0 then raise exception 'invalid_counter'; end if;
    if r.status not in ('pending','countered') then raise exception 'invalid_request_state'; end if;
    if r.escrow_id is not null and exists(select 1 from public.escrow_records where id=r.escrow_id and status='held') then
      old_escrow:=r.escrow_id;
      perform public._refund_escrow(old_escrow);
    end if;
    insert into public.custom_request_offers(request_id,proposer_id,amount,note,status)
      values(r.id,auth.uid(),_counter_budget,nullif(trim(_note),''),'offered') returning id into offer_id;
    update public.custom_request_offers set status='superseded',responded_at=now()
      where request_id=r.id and id<>offer_id and status='offered';
    update public.custom_requests
      set status='countered',counter_budget=_counter_budget,response_note=nullif(trim(_note),''),countered_at=now(),escrow_id=null
      where id=r.id;
    insert into public.notifications(user_id,kind,payload)
      values(r.client_id,'custom_request_countered',jsonb_build_object('request_id',r.id,'offer_id',offer_id,'amount',_counter_budget));
  elsif _status='in_progress' then
    if r.status<>'accepted' then raise exception 'invalid_request_state'; end if;
    update public.custom_requests set status='in_progress',response_note=nullif(trim(_note),'') where id=r.id;
  elsif _status='delivered' then
    if r.status<>'in_progress' then raise exception 'invalid_request_state'; end if;
    update public.custom_requests set status='delivered',delivered_at=now(),response_note=nullif(trim(_note),'') where id=r.id;
    insert into public.notifications(user_id,kind,payload) values(r.client_id,'custom_request_delivered',jsonb_build_object('request_id',r.id));
  else
    raise exception 'invalid_custom_request_status';
  end if;
end $$;

update public.custom_request_offers
set status='offered'
where status='accepted'
  and request_id in (select id from public.custom_requests where status='pending');

create or replace function public.create_custom_request(
  _channel uuid,_brief text,_budget bigint,_idem text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare rid uuid; creator uuid; escrow uuid;
begin
  if nullif(trim(_brief),'') is null or char_length(trim(_brief))<10 then raise exception 'invalid_brief'; end if;
  if _budget<=0 or nullif(trim(_idem),'') is null then raise exception 'invalid_request'; end if;
  select id into rid from public.custom_requests where client_id=auth.uid() and idempotency_key=_idem;
  if rid is not null then return rid; end if;
  select owner_id into creator from public.channels where id=_channel;
  if creator is null or not public.has_role(creator,'creator') then raise exception 'creator_not_available'; end if;
  insert into public.custom_requests(client_id,channel_id,brief,budget,idempotency_key)
    values(auth.uid(),_channel,trim(_brief),_budget,_idem) returning id into rid;
  escrow:=public._hold_escrow(auth.uid(),creator,_budget,'custom_request',rid,'custom_request:'||rid::text);
  update public.custom_requests set escrow_id=escrow where id=rid;
  insert into public.custom_request_offers(request_id,proposer_id,amount,note,status)
    values(rid,auth.uid(),_budget,null,'offered');
  insert into public.notifications(user_id,kind,payload)
    values(creator,'custom_request_received',jsonb_build_object('request_id',rid));
  return rid;
end $$;

create or replace function public.buy_bundle_v2(
  _bundle uuid,_promotion_code text default null,_idem text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare b public.bundles; final_price bigint; discount bigint:=0; promo_id uuid; id uuid:=gen_random_uuid(); txn uuid; idem_value text;
begin
  idem_value:=nullif(trim(_idem),'');
  if idem_value is null then raise exception 'idempotency_key_required'; end if;
  select * into b from public.bundles where id=_bundle for update;
  if not found or b.status<>'active' or (b.expires_at is not null and b.expires_at<=now()) then raise exception 'bundle_not_available'; end if;
  if exists(select 1 from public.bundle_purchases where buyer_id=auth.uid() and bundle_id=_bundle) then
    select id into id from public.bundle_purchases where buyer_id=auth.uid() and bundle_id=_bundle;
    return id;
  end if;
  select p.promotion_id,p.discount_amount into promo_id,discount
    from public._apply_promotion(b.channel_id,_promotion_code,auth.uid(),b.price,'bundle') p;
  final_price:=b.price-coalesce(discount,0);
  txn:=public._spend_on_channel(auth.uid(),b.channel_id,final_price,'bundle','bundle',b.id,'bundle:'||b.id::text||':'||idem_value);
  insert into public.bundle_purchases(id,buyer_id,bundle_id,price_paid,txn_id,discount_amount,promotion_id)
    values(id,auth.uid(),b.id,final_price,txn,coalesce(discount,0),promo_id);
  if promo_id is not null then
    insert into public.promotion_redemptions(promotion_id,user_id,bundle_purchase_id,discount_amount)
      values(promo_id,auth.uid(),id,coalesce(discount,0));
  end if;
  return id;
end $$;

create or replace function public.create_order_v2(
  _items jsonb,_shipping_ciphertext text,_shipping_nonce text,_idem text,_promotion_code text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare row_item jsonb; p public.products; oid uuid; channel uuid; subtotal bigint:=0; total bigint; qty integer; promo_id uuid; discount bigint:=0; eid uuid;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  if nullif(trim(_idem),'') is null then raise exception 'idempotency_key_required'; end if;
  if jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'order_items_required'; end if;
  if nullif(trim(_shipping_ciphertext),'') is null or nullif(trim(_shipping_nonce),'') is null then raise exception 'shipping_encryption_required'; end if;
  if char_length(_shipping_ciphertext)>20000 then raise exception 'shipping_payload_too_large'; end if;
  select id into oid from public.orders where buyer_id=auth.uid() and idempotency_key=_idem for update;
  if oid is not null then return oid; end if;

  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=coalesce((row_item->>'quantity')::integer,0);
    if qty<=0 or qty>50 then raise exception 'invalid_quantity'; end if;
    select * into p from public.products where id=(row_item->>'product_id')::uuid and active for update;
    if not found or p.stock<qty then raise exception 'product_unavailable'; end if;
    if channel is null then channel:=p.channel_id; elsif channel<>p.channel_id then raise exception 'single_channel_order'; end if;
    subtotal:=subtotal+(p.price*qty);
  end loop;

  select x.promotion_id,x.discount_amount into promo_id,discount
    from public._apply_promotion(channel,_promotion_code,auth.uid(),subtotal,'product') x;
  total:=subtotal-coalesce(discount,0);
  if total<=0 then raise exception 'invalid_order_total'; end if;

  oid:=gen_random_uuid();
  insert into public.orders(id,buyer_id,channel_id,total,status,idempotency_key,shipping,shipping_ciphertext,shipping_nonce,shipping_schema_version,discount_amount,promotion_id)
    values(oid,auth.uid(),channel,total,'paid_escrow',_idem,'{}'::jsonb,_shipping_ciphertext,_shipping_nonce,1,coalesce(discount,0),promo_id);

  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=(row_item->>'quantity')::integer;
    select * into p from public.products where id=(row_item->>'product_id')::uuid for update;
    insert into public.order_items(order_id,product_id,quantity,unit_price) values(oid,p.id,qty,p.price);
    update public.products set stock=stock-qty where id=p.id;
  end loop;

  eid:=public._hold_escrow(auth.uid(),(select owner_id from public.channels where id=channel),total,'product',oid,'order:'||oid::text);
  update public.orders set escrow_id=eid where id=oid;

  if promo_id is not null then
    insert into public.promotion_redemptions(promotion_id,user_id,order_id,discount_amount)
      values(promo_id,auth.uid(),oid,coalesce(discount,0));
  end if;

  insert into public.notifications(user_id,kind,payload)
    values((select owner_id from public.channels where id=channel),'order_received',jsonb_build_object('order_id',oid));
  return oid;
end $$;

create or replace function public.get_featured_channels(_limit integer default 20)
returns table(channel_id uuid,handle text,display_name text,placement text)
language sql stable security definer set search_path=public
as $$
  select f.channel_id,c.handle::text,c.display_name,f.placement
  from public.featured_channels f
  join public.channels c on c.id=f.channel_id
  join public.profiles p on p.id=c.owner_id and p.status='active'
  where f.status='active' and f.starts_at<=now() and f.ends_at>now()
  order by f.starts_at desc
  limit greatest(1,least(_limit,50))
$$;

create or replace function public.create_featured_channel_admin(
  _channel uuid,_placement text,_starts_at timestamptz,_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'admin_required'; end if;
  if _placement not in ('discovery','home','search') or _ends_at<=_starts_at then raise exception 'invalid_featured_channel'; end if;
  insert into public.featured_channels(id,channel_id,placement,starts_at,ends_at,status,approved_by,source)
  values(id,_channel,_placement,_starts_at,_ends_at,'active',auth.uid(),'admin');
  return id;
end $$;

create or replace function public.create_premium_feature(
  _code text,_name_key text,_description_key text,_price bigint,_duration_days integer,_active boolean
) returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'admin_required'; end if;
  if _price<=0 or _duration_days<=0 then raise exception 'invalid_premium_feature'; end if;
  insert into public.premium_features(id,code,name_key,description_key,price,duration_days,active)
  values(id,trim(_code),trim(_name_key),trim(_description_key),_price,_duration_days,_active)
  on conflict(code) do update set name_key=excluded.name_key,description_key=excluded.description_key,price=excluded.price,duration_days=excluded.duration_days,active=excluded.active;
  select id into id from public.premium_features where code=trim(_code);
  return id;
end $$;

grant execute on function public.create_creator_goal(uuid,text,bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.update_goal_progress(uuid) to authenticated;
grant execute on function public.create_featured_channel_admin(uuid,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.create_premium_feature(text,text,text,bigint,integer,boolean) to authenticated;
grant execute on function public.get_featured_channels(integer) to authenticated;

revoke all on function public.create_featured_channel_admin(uuid,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.create_premium_feature(text,text,text,bigint,integer,boolean) from public,anon;

create index if not exists promotions_channel_active_idx on public.promotions(channel_id,active,starts_at,ends_at);
create index if not exists user_premium_features_expiry_idx on public.user_premium_features(status,ends_at);
