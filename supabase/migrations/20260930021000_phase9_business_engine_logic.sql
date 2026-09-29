
-- Prively Fase 9: server-side business logic, security, rankings and lifecycle.

alter table public.bundle_purchases
  add column if not exists discount_amount bigint not null default 0;
alter table public.bundle_purchases
  add column if not exists promotion_id uuid references public.promotions;
alter table public.bundle_purchases
  drop constraint if exists bundle_purchases_discount_check;
alter table public.bundle_purchases
  add constraint bundle_purchases_discount_check check (discount_amount >= 0);

create or replace function public._apply_promotion(
  _channel uuid,
  _code text,
  _user uuid,
  _subtotal bigint,
  _applies_to text
) returns table(promotion_id uuid, discount_amount bigint)
language plpgsql security definer set search_path=public
as $$
declare p public.promotions;
declare used_count bigint;
declare total_used bigint;
declare discount bigint;
begin
  if nullif(trim(_code),'') is null then
    return;
  end if;
  select * into p
  from public.promotions
  where channel_id=_channel
    and code=lower(trim(_code))
    and active
    and starts_at<=now()
    and (ends_at is null or ends_at>now())
  for update;

  if not found then
    raise exception 'promotion_not_available';
  end if;
  if p.applies_to <> 'all' and p.applies_to <> _applies_to then
    raise exception 'promotion_not_applicable';
  end if;
  if p.min_subtotal is not null and _subtotal < p.min_subtotal then
    raise exception 'promotion_minimum_not_met';
  end if;

  select count(*) into used_count
  from public.promotion_redemptions
  where promotion_id=p.id and user_id=_user;

  if used_count >= p.per_user_limit then
    raise exception 'promotion_user_limit_reached';
  end if;

  if p.max_redemptions is not null then
    select count(*) into total_used
    from public.promotion_redemptions
    where promotion_id=p.id;
    if total_used >= p.max_redemptions then
      raise exception 'promotion_limit_reached';
    end if;
  end if;

  if p.kind='percent' then
    discount := floor((_subtotal * p.value) / 10000);
  else
    discount := p.value;
  end if;

  if p.max_discount is not null then
    discount := least(discount,p.max_discount);
  end if;
  discount := greatest(0,least(discount,_subtotal));

  return query select p.id,discount;
end $$;

create or replace function public.create_promotion(
  _channel uuid,
  _code text,
  _name text,
  _kind text,
  _value bigint,
  _applies_to text default 'all',
  _min_subtotal bigint default null,
  _max_discount bigint default null,
  _max_redemptions integer default null,
  _per_user_limit smallint default 1,
  _starts_at timestamptz default now(),
  _ends_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if lower(trim(_code)) !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then raise exception 'invalid_promotion_code'; end if;
  if _kind not in ('percent','fixed') or _value<=0 then raise exception 'invalid_promotion'; end if;
  if _kind='percent' and _value>10000 then raise exception 'invalid_promotion'; end if;
  if _applies_to not in ('all','bundle','product','custom_request','subscription','ppv','gift') then raise exception 'invalid_promotion_target'; end if;
  insert into public.promotions(
    id,channel_id,code,name,kind,value,applies_to,min_subtotal,max_discount,
    max_redemptions,per_user_limit,starts_at,ends_at,active,created_by
  ) values (
    id,_channel,lower(trim(_code)),trim(_name),_kind,_value,_applies_to,_min_subtotal,
    _max_discount,_max_redemptions,_per_user_limit,_starts_at,_ends_at,false,auth.uid()
  );
  return id;
end $$;

create or replace function public.set_promotion_active(_promotion uuid,_active boolean)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not exists(
    select 1 from public.promotions p
    where p.id=_promotion and public.is_creator_of_channel(auth.uid(),p.channel_id)
  ) then raise exception 'forbidden'; end if;
  update public.promotions set active=_active,updated_at=now() where id=_promotion;
end $$;

create or replace function public.create_custom_request(
  _channel uuid,_brief text,_budget bigint,_idem text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare rid uuid; creator uuid; escrow uuid;
begin
  if nullif(trim(_brief),'') is null or char_length(trim(_brief))<10 then raise exception 'invalid_brief'; end if;
  if _budget<=0 then raise exception 'invalid_budget'; end if;
  select id into rid from public.custom_requests where client_id=auth.uid() and idempotency_key=_idem;
  if rid is not null then return rid; end if;
  select owner_id into creator from public.channels where id=_channel;
  if creator is null or not public.has_role(creator,'creator') then raise exception 'creator_not_available'; end if;
  insert into public.custom_requests(client_id,channel_id,brief,budget,idempotency_key)
  values(auth.uid(),_channel,trim(_brief),_budget,_idem) returning id into rid;
  escrow:=public._hold_escrow(auth.uid(),creator,_budget,'custom_request',rid,'custom_request:'||rid::text);
  update public.custom_requests set escrow_id=escrow where id=rid;
  insert into public.custom_request_offers(request_id,proposer_id,amount,note,status)
  values(rid,auth.uid(),_budget,null,'accepted');
  insert into public.notifications(user_id,kind,payload)
  values(creator,'custom_request_received',jsonb_build_object('request_id',rid));
  return rid;
end $$;

create or replace function public.respond_custom_request(
  _request uuid,
  _status text,
  _counter_budget bigint default null,
  _note text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare r public.custom_requests; creator uuid; old_escrow uuid; offer_id uuid;
begin
  select * into r from public.custom_requests where id=_request for update;
  if not found or not public.is_creator_of_channel(auth.uid(),r.channel_id) then raise exception 'forbidden'; end if;
  creator:=auth.uid();

  if _status='accepted' then
    if r.status not in ('pending','countered') then raise exception 'invalid_request_state'; end if;
    update public.custom_requests
      set status='accepted',accepted_at=coalesce(accepted_at,now()),response_note=nullif(trim(_note),'')
      where id=r.id;
    insert into public.notifications(user_id,kind,payload)
      values(r.client_id,'custom_request_accepted',jsonb_build_object('request_id',r.id));
  elsif _status='declined' then
    if r.escrow_id is not null and exists(select 1 from public.escrow_records where id=r.escrow_id and status='held') then
      perform public._refund_escrow(r.escrow_id);
    end if;
    update public.custom_requests
      set status='refunded',response_note=nullif(trim(_note),'')
      where id=r.id;
    insert into public.notifications(user_id,kind,payload)
      values(r.client_id,'custom_request_declined',jsonb_build_object('request_id',r.id));
  elsif _status='countered' then
    if _counter_budget is null or _counter_budget<=0 then raise exception 'invalid_counter'; end if;
    if r.status not in ('pending','countered') then raise exception 'invalid_request_state'; end if;
    if r.escrow_id is not null and exists(select 1 from public.escrow_records where id=r.escrow_id and status='held') then
      old_escrow:=r.escrow_id;
      perform public._refund_escrow(old_escrow);
    end if;
    insert into public.custom_request_offers(request_id,proposer_id,amount,note,status)
      values(r.id,creator,_counter_budget,nullif(trim(_note),''),'offered') returning id into offer_id;
    update public.custom_request_offers
      set status='superseded',responded_at=now()
      where request_id=r.id and id<>offer_id and status='offered';
    update public.custom_requests
      set status='countered',counter_budget=_counter_budget,response_note=nullif(trim(_note),''),
          countered_at=now(),escrow_id=null
      where id=r.id;
    insert into public.notifications(user_id,kind,payload)
      values(r.client_id,'custom_request_countered',jsonb_build_object('request_id',r.id,'offer_id',offer_id,'amount',_counter_budget));
  elsif _status='in_progress' then
    if r.status<>'accepted' then raise exception 'invalid_request_state'; end if;
    update public.custom_requests set status='in_progress',response_note=nullif(trim(_note),'') where id=r.id;
  elsif _status='delivered' then
    if r.status<>'in_progress' then raise exception 'invalid_request_state'; end if;
    update public.custom_requests set status='delivered',delivered_at=now(),response_note=nullif(trim(_note),'') where id=r.id;
    insert into public.notifications(user_id,kind,payload)
      values(r.client_id,'custom_request_delivered',jsonb_build_object('request_id',r.id));
  else
    raise exception 'invalid_custom_request_status';
  end if;
end $$;

create or replace function public.update_custom_request(_request uuid,_status text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  perform public.respond_custom_request(_request,_status,null,null);
end $$;

create or replace function public.accept_custom_request_counter(_request uuid,_offer uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare r public.custom_requests; o public.custom_request_offers; new_escrow uuid; creator uuid;
begin
  select * into r from public.custom_requests where id=_request for update;
  select * into o from public.custom_request_offers where id=_offer and request_id=_request and status='offered' for update;
  if not found or r.client_id<>auth.uid() or r.status<>'countered' then raise exception 'counter_not_available'; end if;
  select owner_id into creator from public.channels where id=r.channel_id;
  new_escrow:=public._hold_escrow(auth.uid(),creator,o.amount,'custom_request',r.id,'custom_request_counter:'||o.id::text);
  update public.custom_request_offers set status='accepted',responded_at=now() where id=o.id;
  update public.custom_request_offers set status='superseded',responded_at=now()
    where request_id=r.id and id<>o.id and status='offered';
  update public.custom_requests
    set budget=o.amount,counter_budget=null,escrow_id=new_escrow,status='accepted',accepted_at=now()
    where id=r.id;
  insert into public.notifications(user_id,kind,payload)
    values(creator,'custom_request_counter_accepted',jsonb_build_object('request_id',r.id,'offer_id',o.id));
end $$;

create or replace function public.dispute_custom_request(_request uuid,_reason text)
returns void language plpgsql security definer set search_path=public
as $$
declare r public.custom_requests;
begin
  select * into r from public.custom_requests where id=_request for update;
  if not found or (r.client_id<>auth.uid() and not public.is_creator_of_channel(auth.uid(),r.channel_id)) then raise exception 'forbidden'; end if;
  if r.escrow_id is null then raise exception 'escrow_not_found'; end if;
  update public.escrow_records set status='disputed' where id=r.escrow_id and status='held';
  update public.custom_requests set status='disputed',disputed_at=now() where id=r.id;
  perform public.phase8_audit('custom_request_disputed','custom_request',r.id,coalesce(nullif(trim(_reason),''),'Disputa de pedido personalizado'),jsonb_build_object('escrow_id',r.escrow_id));
end $$;

create or replace function public.create_auction_v2(
  _channel uuid,_title text,_description text,_minimum bigint,
  _increment bigint,_starts timestamptz,_ends timestamptz,_post uuid
) returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if _ends<=_starts or _ends<=now() or _minimum<=0 or _increment<=0 then raise exception 'invalid_auction'; end if;
  insert into public.auctions(
    id,channel_id,post_id,title,description,starts_at,ends_at,minimum_bid,bid_increment,
    anti_sniping_window_seconds,anti_sniping_extension_seconds,status
  ) values(
    id,_channel,_post,trim(_title),nullif(trim(_description),''),_starts,_ends,_minimum,_increment,120,120,
    case when _starts<=now() then 'live' else 'scheduled' end
  );
  return id;
end $$;

create or replace function public.create_auction(
  _channel uuid,_title text,_description text,_minimum bigint,_starts timestamptz,_ends timestamptz,_post uuid
) returns uuid language plpgsql security definer set search_path=public
as $$
begin
  return public.create_auction_v2(_channel,_title,_description,_minimum,100,_starts,_ends,_post);
end $$;

create or replace function public.place_bid(_auction uuid,_amount bigint,_idem text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare a public.auctions; high public.bids; eid uuid; bid_id uuid:=gen_random_uuid(); min_allowed bigint;
begin
  select * into a from public.auctions where id=_auction for update;
  if not found or a.status not in ('scheduled','live') or now()>=a.ends_at then raise exception 'auction_not_open'; end if;
  if now()<a.starts_at then raise exception 'auction_not_started'; end if;
  select * into high from public.bids where auction_id=a.id and status='active'
    order by amount desc,created_at desc limit 1;
  min_allowed:=greatest(a.minimum_bid,coalesce(high.amount+a.bid_increment,a.minimum_bid));
  if _amount<min_allowed then raise exception 'bid_increment_not_met'; end if;

  select b.id into bid_id
  from public.bids b
  join public.escrow_records e on e.id=b.escrow_id
  where b.auction_id=a.id and b.bidder_id=auth.uid()
    and e.held_txn in(
      select txn_id from public.idempotency_keys
      where owner_id=auth.uid() and key='auction:'||a.id::text||':'||_idem
    )
  limit 1;
  if exists(select 1 from public.bids where id=bid_id) then return bid_id; end if;

  eid:=public._hold_escrow(
    auth.uid(),
    (select owner_id from public.channels where id=a.channel_id),
    _amount,'auction',a.id,'auction:'||a.id::text||':'||_idem
  );

  insert into public.bids(id,auction_id,bidder_id,amount,escrow_id)
    values(bid_id,a.id,auth.uid(),_amount,eid);

  if high.id is not null then
    update public.bids set status='outbid' where id=high.id;
    perform public._refund_escrow(high.escrow_id);
    insert into public.notifications(user_id,kind,payload)
      values(high.bidder_id,'auction_outbid',jsonb_build_object('auction_id',a.id,'bid_amount',_amount));
  end if;

  if a.ends_at-now()<=make_interval(secs=>a.anti_sniping_window_seconds) then
    update public.auctions
      set ends_at=a.ends_at+make_interval(secs=>a.anti_sniping_extension_seconds),status='live'
      where id=a.id;
  else
    update public.auctions set status='live' where id=a.id;
  end if;

  return bid_id;
end $$;

create or replace function public.close_auction(_auction uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare a public.auctions; w public.bids; b public.bids; winner_owner uuid;
begin
  select * into a from public.auctions where id=_auction for update;
  if not found or a.status='closed' then return; end if;
  if now()<a.ends_at then raise exception 'auction_not_finished'; end if;
  select * into w from public.bids where auction_id=a.id and status='active'
    order by amount desc,created_at desc limit 1;
  if w.id is not null then
    perform public._release_escrow(w.escrow_id,'auction');
    update public.bids set status='won' where id=w.id;
    update public.auctions set winner_bid_id=w.id,status='closed' where id=a.id;
    select owner_id into winner_owner from public.channels where id=a.channel_id;
    insert into public.notifications(user_id,kind,payload)
      values(w.bidder_id,'auction_won',jsonb_build_object('auction_id',a.id,'amount',w.amount));
  else
    update public.auctions set status='closed' where id=a.id;
  end if;

  for b in
    select * from public.bids where auction_id=a.id and status='active'
  loop
    update public.bids set status='refunded' where id=b.id;
    perform public._refund_escrow(b.escrow_id);
  end loop;

  perform public.phase8_audit('auction_closed','auction',a.id,'Leilão fechado automaticamente',jsonb_build_object('winner_bid_id',w.id));
end $$;

create or replace function public.buy_bundle_v2(_bundle uuid,_promotion_code text default null,_idem text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare b public.bundles; final_price bigint; discount bigint:=0; promo_id uuid; id uuid:=gen_random_uuid(); txn uuid;
begin
  select * into b from public.bundles where id=_bundle for update;
  if not found or b.status<>'active' or (b.expires_at is not null and b.expires_at<=now()) then raise exception 'bundle_not_available'; end if;
  if exists(select 1 from public.bundle_purchases where buyer_id=auth.uid() and bundle_id=_bundle) then
    select id into id from public.bundle_purchases where buyer_id=auth.uid() and bundle_id=_bundle;
    return id;
  end if;

  select p.promotion_id,p.discount_amount into promo_id,discount
  from public._apply_promotion(b.channel_id,_promotion_code,auth.uid(),b.price,'bundle') p;

  final_price:=b.price-coalesce(discount,0);
  txn:=public._spend_on_channel(auth.uid(),b.channel_id,final_price,'bundle','bundle',b.id,'bundle:'||b.id::text||':'||coalesce(_idem,crypto_random_uuid()::text));
  insert into public.bundle_purchases(id,buyer_id,bundle_id,price_paid,txn_id,discount_amount,promotion_id)
    values(id,auth.uid(),b.id,final_price,txn,coalesce(discount,0),promo_id);

  if promo_id is not null then
    insert into public.promotion_redemptions(promotion_id,user_id,bundle_purchase_id,discount_amount)
      values(promo_id,auth.uid(),id,coalesce(discount,0));
  end if;
  return id;
end $$;

create or replace function public.buy_bundle(_bundle uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public
as $$ begin return public.buy_bundle_v2(_bundle,null,_idem); end $$;

create or replace function public.create_product(
  _channel uuid,_name text,_description text,_price bigint,_stock integer
) returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) or _price<=0 or _stock<0 then raise exception 'invalid_product'; end if;
  insert into public.products(id,channel_id,name,description,price,stock,active)
    values(id,_channel,trim(_name),nullif(trim(_description),''),_price,_stock,true);
  return id;
end $$;

create or replace function public.update_product(
  _product uuid,_name text,_description text,_price bigint,_stock integer,_active boolean
) returns void language plpgsql security definer set search_path=public
as $$
declare p public.products;
begin
  select * into p from public.products where id=_product for update;
  if not found or not public.is_creator_of_channel(auth.uid(),p.channel_id) then raise exception 'forbidden'; end if;
  if _price<=0 or _stock<0 then raise exception 'invalid_product'; end if;
  update public.products
  set name=trim(_name),description=nullif(trim(_description),''),price=_price,stock=_stock,active=_active
  where id=p.id;
end $$;

create or replace function public.create_order_v2(
  _items jsonb,_shipping_ciphertext text,_shipping_nonce text,_idem text,_promotion_code text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare row_item jsonb; p public.products; oid uuid; channel uuid; subtotal bigint:=0; total bigint; qty integer;
declare promo_id uuid; discount bigint:=0; promo record; eid uuid;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  if jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'order_items_required'; end if;
  if nullif(trim(_shipping_ciphertext),'') is null or nullif(trim(_shipping_nonce),'') is null then raise exception 'shipping_encryption_required'; end if;
  if char_length(_shipping_ciphertext)>20000 then raise exception 'shipping_payload_too_large'; end if;

  select id into oid from public.orders where buyer_id=auth.uid() and idempotency_key=_idem for update;
  if oid is not null then return oid; end if;

  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=coalesce((row_item->>'quantity')::integer,0);
    if qty<=0 or qty>50 then raise exception 'invalid_quantity'; end if;
    select * into p from public.products
      where id=(row_item->>'product_id')::uuid and active
      for update;
    if not found or p.stock<qty then raise exception 'product_unavailable'; end if;
    if channel is null then channel:=p.channel_id;
    elsif channel<>p.channel_id then raise exception 'single_channel_order'; end if;
    subtotal:=subtotal+(p.price*qty);
  end loop;

  select x.promotion_id,x.discount_amount into promo_id,discount
  from public._apply_promotion(channel,_promotion_code,auth.uid(),subtotal,'product') x;

  total:=subtotal-coalesce(discount,0);
  if total<=0 then raise exception 'invalid_order_total'; end if;

  oid:=gen_random_uuid();
  insert into public.orders(
    id,buyer_id,channel_id,total,status,idempotency_key,shipping,
    shipping_ciphertext,shipping_nonce,shipping_schema_version,discount_amount,promotion_id
  ) values(
    oid,auth.uid(),channel,total,'paid_escrow',_idem,'{}'::jsonb,
    _shipping_ciphertext,_shipping_nonce,1,coalesce(discount,0),promo_id
  );

  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=(row_item->>'quantity')::integer;
    select * into p from public.products where id=(row_item->>'product_id')::uuid for update;
    insert into public.order_items(order_id,product_id,quantity,unit_price)
      values(oid,p.id,qty,p.price);
    update public.products set stock=stock-qty where id=p.id;
  end loop;

  eid:=public._hold_escrow(
    auth.uid(),
    (select owner_id from public.channels where id=channel),
    total,'product',oid,'order:'||oid::text
  );
  update public.orders set escrow_id=eid where id=oid;

  if promo_id is not null then
    insert into public.promotion_redemptions(
      promotion_id,user_id,order_id,discount_amount
    ) values(promo_id,auth.uid(),oid,coalesce(discount,0));
  end if;

  insert into public.notifications(user_id,kind,payload)
    values((select owner_id from public.channels where id=channel),'order_received',jsonb_build_object('order_id',oid));
  return oid;
end $$;

create or replace function public.dispute_order(_order uuid,_reason text)
returns void language plpgsql security definer set search_path=public
as $$
declare o public.orders;
begin
  select * into o from public.orders where id=_order for update;
  if not found or (o.buyer_id<>auth.uid() and not public.is_creator_of_channel(auth.uid(),o.channel_id)) then raise exception 'forbidden'; end if;
  if o.escrow_id is null then raise exception 'escrow_not_found'; end if;
  update public.escrow_records set status='disputed' where id=o.escrow_id and status='held';
  update public.orders set status='disputed' where id=o.id;
  perform public.phase8_audit('order_disputed','order',o.id,coalesce(nullif(trim(_reason),''),'Disputa de encomenda'),jsonb_build_object('escrow_id',o.escrow_id));
end $$;

create or replace function public.release_due_business_escrows()
returns integer language plpgsql security definer set search_path=public
as $$
declare e public.escrow_records; released_count integer:=0;
declare hold_hours integer:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);
declare ready boolean;
begin
  for e in
    select * from public.escrow_records
    where status='held'
      and created_at <= now()-make_interval(hours=>hold_hours)
      and source_type in ('custom_request','product')
    order by created_at
    for update skip locked
  loop
    ready:=false;
    if e.source_type='custom_request' then
      ready:=exists(select 1 from public.custom_requests r where r.id=e.source_id and r.status='delivered');
    elsif e.source_type='product' then
      ready:=exists(select 1 from public.orders o where o.id=e.source_id and o.status='delivered');
    end if;
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
        null;
      end;
    end if;
  end loop;
  return released_count;
end $$;

create or replace function public.record_login()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare s public.streaks; today date:=(now() at time zone 'Africa/Maputo')::date;
begin
  select * into s from public.streaks where user_id=auth.uid() for update;
  if not found then
    insert into public.streaks(user_id,current_days,longest_days,last_day)
      values(auth.uid(),1,1,today);
  elsif s.last_day=today then
    null;
  elsif s.last_day=today-1 then
    update public.streaks
      set current_days=current_days+1,longest_days=greatest(longest_days,current_days+1),last_day=today
      where user_id=auth.uid();
  else
    update public.streaks set current_days=1,last_day=today where user_id=auth.uid();
  end if;

  return jsonb_build_object(
    'current_days',(select current_days from public.streaks where user_id=auth.uid()),
    'longest_days',(select longest_days from public.streaks where user_id=auth.uid()),
    'points',coalesce((select points from public.loyalty_points where user_id=auth.uid()),0)
  );
end $$;

create or replace function public.complete_mission(_mission uuid,_increment integer default 1)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare m public.missions; p public.mission_progress; next_progress integer; already boolean:=false; awarded bigint:=0;
begin
  select * into m from public.missions where id=_mission and active for update;
  if not found or m.requires_spend then raise exception 'mission_not_available'; end if;
  if _increment<=0 or _increment>100 then raise exception 'invalid_increment'; end if;

  select * into p from public.mission_progress where mission_id=m.id and user_id=auth.uid() for update;
  if not found then
    next_progress:=least(m.target,_increment);
    insert into public.mission_progress(mission_id,user_id,progress,completed_at)
      values(m.id,auth.uid(),next_progress,case when next_progress>=m.target then now() end);
  else
    next_progress:=least(m.target,p.progress+_increment);
    update public.mission_progress
      set progress=next_progress,completed_at=case when next_progress>=m.target and completed_at is null then now() else completed_at end,updated_at=now()
      where mission_id=m.id and user_id=auth.uid();
  end if;

  if next_progress>=m.target and (p.completed_at is null) then
    awarded:=m.points_reward;
    insert into public.loyalty_points(user_id,points,lifetime_points)
      values(auth.uid(),awarded,awarded)
      on conflict(user_id) do update set points=public.loyalty_points.points+awarded,lifetime_points=public.loyalty_points.lifetime_points+awarded,updated_at=now();
    insert into public.point_events(user_id,points,kind,ref_type,ref_id)
      values(auth.uid(),awarded,'mission','mission',m.id);
  end if;

  return jsonb_build_object('progress',next_progress,'target',m.target,'completed',next_progress>=m.target,'points_awarded',awarded);
end $$;

create or replace function public.award_badges()
returns integer language plpgsql security definer set search_path=public
as $$
declare b record; u record; n integer:=0;
begin
  for b in select * from public.badges where active and points_threshold is not null loop
    for u in select user_id,lifetime_points from public.loyalty_points where lifetime_points>=b.points_threshold loop
      insert into public.user_badges(user_id,badge_id,source)
        values(u.user_id,b.id,'earned')
        on conflict(user_id,badge_id) do nothing;
      if found then n:=n+1; end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.purchase_badge(_badge uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare b public.badges; txn uuid; id uuid:=gen_random_uuid();
declare platform constant uuid:='00000000-0000-0000-0000-000000000000';
begin
  select * into b from public.badges where id=_badge and active and price is not null for update;
  if not found then raise exception 'badge_not_purchasable'; end if;
  if exists(select 1 from public.user_badges where user_id=auth.uid() and badge_id=b.id) then
    return b.id;
  end if;
  insert into public.idempotency_keys(owner_id,key,txn_id)
    values(auth.uid(),'badge:'||b.id::text||':'||_idem,gen_random_uuid())
    on conflict(owner_id,key) do nothing;
  select txn_id into txn from public.idempotency_keys where owner_id=auth.uid() and key='badge:'||b.id::text||':'||_idem;
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  perform public.assert_spend_limit(auth.uid(),b.price);
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'wallet',auth.uid(),-b.price,'premium','badge',b.id,jsonb_build_object('feature','badge')),
    (txn,'platform_revenue',platform,b.price,'premium','badge',b.id,jsonb_build_object('feature','badge'));
  insert into public.user_badges(user_id,badge_id,source) values(auth.uid(),b.id,'purchased');
  return b.id;
end $$;

create or replace function public.get_fan_ranking(_channel uuid,_limit integer default 20)
returns table(rank integer,pseudonym text)
language sql stable security definer set search_path=public
as $$
  select f.rank,p.handle::text
  from public.fan_rankings_weekly f
  join public.profiles p on p.id=f.user_id
  where f.channel_id=_channel
    and f.week_start=date_trunc('week',current_date)::date
    and not p.fan_ranking_opt_out
  order by f.rank
  limit greatest(1,least(_limit,100));
$$;

create or replace function public.refresh_rankings()
returns integer language plpgsql security definer set search_path=public
as $$
declare w date:=date_trunc('week',current_date)::date;
declare creator_count integer:=0;
begin
  delete from public.creator_rankings_weekly where week_start=w;
  with metrics as (
    select c.id channel_id,
      coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.status='active' and s.created_at>=date_trunc('week',now())),0)::bigint new_subscribers,
      coalesce((select count(*) from public.follows f where f.channel_id=c.id and f.created_at>=date_trunc('week',now())),0)::bigint new_follows,
      coalesce((select count(*) from public.comments cm join public.posts po on po.id=cm.post_id where po.channel_id=c.id and cm.created_at>=date_trunc('week',now())),0)::bigint comments,
      coalesce((select count(*) from public.reactions rx join public.posts po on po.id=rx.post_id where po.channel_id=c.id and rx.created_at>=date_trunc('week',now())),0)::bigint reactions,
      coalesce((select count(*) from public.posts po where po.channel_id=c.id and po.status='published' and po.created_at>=date_trunc('week',now())),0)::bigint new_posts
    from public.channels c
  )
  insert into public.creator_rankings_weekly(week_start,channel_id,rank,score,score_components)
  select w,channel_id,
    row_number() over(order by (new_subscribers*100 + new_follows*20 + comments*5 + reactions*2 + new_posts*3) desc,channel_id),
    (new_subscribers*100 + new_follows*20 + comments*5 + reactions*2 + new_posts*3),
    jsonb_build_object('new_subscribers',new_subscribers,'new_follows',new_follows,'comments',comments,'reactions',reactions,'new_posts',new_posts)
  from metrics;

  get diagnostics creator_count=row_count;

  delete from public.fan_rankings_weekly where week_start=w;
  with spend as (
    select (l.metadata->>'channel_id')::uuid channel_id,l.owner_id user_id,sum(-l.amount)::bigint score
    from public.ledger_entries l
    where l.account='wallet'
      and l.amount<0
      and l.created_at>=date_trunc('week',now())
      and l.metadata ? 'channel_id'
    group by (l.metadata->>'channel_id')::uuid,l.owner_id
  )
  insert into public.fan_rankings_weekly(week_start,channel_id,user_id,rank,score)
  select w,channel_id,user_id,
    row_number() over(partition by channel_id order by score desc,user_id),
    score
  from spend s
  join public.profiles p on p.id=s.user_id
  where not p.fan_ranking_opt_out;

  return creator_count;
end $$;

create or replace function public.refresh_creator_analytics()
returns void language plpgsql security definer set search_path=public
as $$
begin
  insert into public.creator_analytics_daily(
    channel_id,day,views,unique_viewers,messages,sales,gross_amount,tips,live_minutes,
    new_subscribers,active_subscribers,followers,comments,reactions
  )
  select c.id,current_date,
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=current_date),0),
    coalesce((select count(distinct a.user_id) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=current_date),0),
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='message_sent' and a.occurred_at>=current_date),0),
    coalesce((select count(*) from public.ledger_entries l where l.account='creator_pending' and l.created_at>=current_date and l.ref_type in ('post','bundle','gift','message','subscription','channel') and l.metadata->>'channel_id'=c.id::text),0),
    coalesce((select sum(l.amount) from public.ledger_entries l where l.account='creator_pending' and l.created_at>=current_date and l.metadata->>'channel_id'=c.id::text and l.kind<>'commission'),0),
    coalesce((select sum(l.amount) from public.ledger_entries l where l.account='creator_pending' and l.kind='tip' and l.created_at>=current_date and l.metadata->>'channel_id'=c.id::text),0),
    coalesce((select sum(extract(epoch from(l.ended_at-l.started_at))/60) from public.live_sessions l where l.channel_id=c.id and l.status='ended' and l.started_at>=current_date),0),
    coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.created_at>=current_date),0),
    coalesce((select count(*) from public.subscriptions s where s.channel_id=c.id and s.status='active' and s.current_period_end>now()),0),
    coalesce((select count(*) from public.follows f where f.channel_id=c.id),0),
    coalesce((select count(*) from public.comments cm join public.posts po on po.id=cm.post_id where po.channel_id=c.id and cm.created_at>=current_date),0),
    coalesce((select count(*) from public.reactions rx join public.posts po on po.id=rx.post_id where po.channel_id=c.id and rx.created_at>=current_date),0)
  from public.channels c
  on conflict(channel_id,day) do update set
    views=excluded.views,unique_viewers=excluded.unique_viewers,messages=excluded.messages,sales=excluded.sales,
    gross_amount=excluded.gross_amount,tips=excluded.tips,live_minutes=excluded.live_minutes,
    new_subscribers=excluded.new_subscribers,active_subscribers=excluded.active_subscribers,
    followers=excluded.followers,comments=excluded.comments,reactions=excluded.reactions;
end $$;

create or replace function public.get_creator_analytics(_channel uuid,_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare rows jsonb;
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.day desc),'[]'::jsonb) into rows
  from (
    select day,views,unique_viewers,messages,sales,gross_amount,tips,live_minutes,
           new_subscribers,active_subscribers,followers,comments,reactions
    from public.creator_analytics_daily
    where channel_id=_channel and day>=current_date-greatest(1,least(_days,365))
    order by day desc
  ) x;
  return rows;
end $$;

create or replace function public.add_fan_note(_channel uuid,_fan uuid,_tag text,_note text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if not public.is_age_verified(_fan) then raise exception 'fan_not_active'; end if;
  insert into public.fan_notes(id,channel_id,fan_id,tag,note) values(id,_channel,_fan,nullif(trim(_tag),''),trim(_note));
  return id;
end $$;

create or replace function public.create_fan_tag(_channel uuid,_name text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  insert into public.fan_tags(id,channel_id,name) values(id,_channel,trim(_name))
  on conflict(channel_id,name) do update set name=excluded.name returning id into id;
  return id;
end $$;

create or replace function public.assign_fan_tag(_tag uuid,_fan uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not exists(
    select 1 from public.fan_tags t
    where t.id=_tag and public.is_creator_of_channel(auth.uid(),t.channel_id)
  ) then raise exception 'forbidden'; end if;
  insert into public.fan_tag_assignments(tag_id,fan_id) values(_tag,_fan) on conflict do nothing;
end $$;

create or replace function public.get_fan_crm(_channel uuid,_limit integer default 100)
returns table(
  fan_id uuid,pseudonym text,subscriptions bigint,purchases bigint,last_purchase_at timestamptz,
  last_message_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  select p.id,p.handle::text,
    coalesce((select count(*) from public.subscriptions s where s.channel_id=_channel and s.subscriber_id=p.id and s.status='active' and s.current_period_end>now()),0),
    coalesce((select count(*) from public.ledger_entries l where l.owner_id=p.id and l.amount<0 and l.account='wallet' and l.metadata->>'channel_id'=_channel::text),0),
    (select max(l.created_at) from public.ledger_entries l where l.owner_id=p.id and l.amount<0 and l.account='wallet' and l.metadata->>'channel_id'=_channel::text),
    (select max(m.created_at) from public.conversations cv join public.messages m on m.conversation_id=cv.id where cv.channel_id=_channel and cv.client_id=p.id)
  from public.profiles p
  where exists(select 1 from public.subscriptions s where s.channel_id=_channel and s.subscriber_id=p.id)
  order by last_purchase_at desc nulls last,p.handle
  limit greatest(1,least(_limit,500))
$$;

create or replace function public.create_referral_code(_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if trim(_code)!~'^[a-z0-9_]{4,24}$' then raise exception 'invalid_referral_code'; end if;
  insert into public.referral_codes(id,creator_id,code) values(id,auth.uid(),lower(trim(_code)));
  return id;
end $$;

create or replace function public.redeem_referral(_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare r public.referral_codes; id uuid:=gen_random_uuid(); feature_enabled boolean;
begin
  select coalesce((value#>>'{}')::boolean,false) into feature_enabled
    from public.platform_settings where key='referral.enabled';
  if not feature_enabled then raise exception 'referral_not_configured'; end if;
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  select * into r from public.referral_codes where code=lower(trim(_code)) and active;
  if not found or r.creator_id=auth.uid() or exists(select 1 from public.referrals where referred_id=auth.uid()) then raise exception 'referral_code_invalid'; end if;
  insert into public.referrals(id,referrer_id,referred_id,code,status,activated_at)
    values(id,r.creator_id,auth.uid(),r.code,'active',now());
  return id;
end $$;

create or replace function public.create_agency(_name text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'agency') then raise exception 'agency_role_required'; end if;
  insert into public.agencies(id,owner_id,name,status) values(id,auth.uid(),trim(_name),'pending');
  return id;
end $$;

create or replace function public.invite_agency_creator(_agency uuid,_creator uuid,_commission_rate_bps integer,_permissions jsonb default '{"analytics":true,"content":false}'::jsonb)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.agencies where id=_agency and owner_id=auth.uid() and status='active') then raise exception 'forbidden'; end if;
  if not public.has_role(_creator,'creator') then raise exception 'creator_required'; end if;
  insert into public.agency_members(agency_id,creator_id,status,permissions,commission_rate_bps)
  values(_agency,_creator,'invited',coalesce(_permissions,'{}'::jsonb),coalesce(_commission_rate_bps,0))
  on conflict(agency_id,creator_id) do update set
    status='invited',permissions=excluded.permissions,commission_rate_bps=excluded.commission_rate_bps,
    invited_at=now(),left_at=null,consent_at=null;
  insert into public.notifications(user_id,kind,payload)
  values(_creator,'agency_invitation',jsonb_build_object('agency_id',_agency));
end $$;

create or replace function public.accept_agency_invite(_agency uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  update public.agency_members
  set status='active',accepted_at=now(),consent_at=now(),left_at=null
  where agency_id=_agency and creator_id=auth.uid() and status='invited';
  if not found then raise exception 'agency_invite_not_found'; end if;
  update public.channels set agency_id=_agency where owner_id=auth.uid();
end $$;

create or replace function public.leave_agency(_agency uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  update public.agency_members set status='left',left_at=now(),consent_at=null
  where agency_id=_agency and creator_id=auth.uid() and status='active';
  if not found then raise exception 'agency_membership_not_found'; end if;
  update public.channels set agency_id=null where owner_id=auth.uid() and agency_id=_agency;
end $$;

create or replace function public.get_agency_dashboard(_agency uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare data jsonb;
begin
  if not public.has_role(auth.uid(),'agency') then raise exception 'agency_role_required'; end if;
  if not exists(select 1 from public.agencies where id=_agency and owner_id=auth.uid()) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pseudonym),'[]'::jsonb) into data
  from (
    select p.handle::text pseudonym,
      coalesce(sum(a.active_subscribers),0)::bigint active_subscribers,
      coalesce(sum(a.followers),0)::bigint followers,
      coalesce(sum(a.views),0)::bigint views,
      coalesce(sum(a.comments+a.reactions),0)::bigint engagements
    from public.agency_members m
    join public.channels c on c.owner_id=m.creator_id and c.agency_id=m.agency_id
    join public.profiles p on p.id=m.creator_id
    left join public.creator_analytics_daily a on a.channel_id=c.id and a.day>=current_date-30
    where m.agency_id=_agency and m.status='active'
    group by p.handle
  ) x;
  return jsonb_build_object('members',data,'financial_access',false,'payout_access',false,'dm_access',false,'kyc_access',false);
end $$;

create or replace function public.purchase_premium_feature(_feature uuid,_channel uuid default null,_idem text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare f public.premium_features; txn uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); ends timestamptz;
declare platform constant uuid:='00000000-0000-0000-0000-000000000000';
begin
  select * into f from public.premium_features where id=_feature and active for update;
  if not found then raise exception 'premium_feature_unavailable'; end if;
  if exists(select 1 from public.user_premium_features u where u.user_id=auth.uid() and u.feature_id=f.id and u.status='active' and u.ends_at>now()) then
    raise exception 'premium_feature_already_active';
  end if;
  if f.code='featured_creator' then
    if _channel is null or not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'channel_required'; end if;
  end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  perform public.assert_spend_limit(auth.uid(),f.price);
  insert into public.idempotency_keys(owner_id,key,txn_id)
    values(auth.uid(),'premium:'||f.id::text||':'||coalesce(_idem,crypto_random_uuid()::text),txn)
    on conflict(owner_id,key) do nothing;
  select txn_id into txn from public.idempotency_keys
    where owner_id=auth.uid() and key='premium:'||f.id::text||':'||coalesce(_idem,crypto_random_uuid()::text);
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

create or replace function public.expire_premium_features()
returns integer language sql security definer set search_path=public
as $$
  with x as (
    update public.user_premium_features
    set status='expired'
    where status='active' and ends_at<=now()
    returning id
  ) select count(*) from x;
$$;

create or replace function public.record_recommendation_event(_channel uuid,_event_type text)
returns bigint language plpgsql security definer set search_path=public
as $$
declare id bigint;
begin
  if _event_type not in ('impression','open','follow','subscribe','purchase','hide','not_interested') then raise exception 'invalid_recommendation_event'; end if;
  insert into public.recommendation_events(user_id,channel_id,event_type)
  values(auth.uid(),_channel,_event_type) returning id into id;
  return id;
end $$;

create or replace function public.recommend_channels(_limit integer default 20)
returns table(channel_id uuid,handle text,display_name text,reason text)
language sql stable security definer set search_path=public
as $$
  with candidates as (
    select c.id,c.handle::text handle,c.display_name,
      (
        case when c.id in (select channel_id from public.follows where follower_id=auth.uid()) then -100 else 0 end +
        case when c.city is not null and c.city=(select city from public.profiles where id=auth.uid()) then 35 else 0 end +
        case when exists(select 1 from public.featured_channels f where f.channel_id=c.id and f.status='active' and f.starts_at<=now() and f.ends_at>now()) then 100 else 0 end +
        coalesce((select sum(a.new_subscribers*5+a.followers+a.comments*2+a.reactions) from public.creator_analytics_daily a where a.channel_id=c.id and a.day>=current_date-7),0) +
        coalesce((select count(*) from public.posts p where p.channel_id=c.id and p.status='published' and p.created_at>=now()-interval '7 days')*2,0) +
        coalesce((select count(*) from public.recommendation_events r where r.user_id=auth.uid() and r.channel_id=c.id and r.event_type='not_interested')*(-200),0)
      ) score,
      case
        when exists(select 1 from public.featured_channels f where f.channel_id=c.id and f.status='active' and f.starts_at<=now() and f.ends_at>now()) then 'destaque'
        when c.city is not null and c.city=(select city from public.profiles where id=auth.uid()) then 'na tua cidade'
        else 'actividade recente'
      end reason
    from public.channels c
    join public.profiles owner on owner.id=c.owner_id and owner.status='active'
    where c.owner_id<>auth.uid()
  )
  select id,handle,display_name,reason
  from candidates
  order by score desc,id
  limit greatest(1,least(_limit,50));
$$;

-- Keep wallet/ledger metadata channel-aware for ranking and CRM.
create or replace function public._spend_on_channel(
  _buyer uuid,_channel uuid,_amount bigint,_kind text,_ref_type text,_ref_id uuid,_idem text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare creator uuid; bal bigint; rate numeric; fee bigint; net bigint; rr bigint; txn uuid:=gen_random_uuid(); existing uuid; hold_hours integer;
begin
  if _buyer is null or _amount<=0 or nullif(trim(_idem),'') is null then raise exception 'invalid_spend_request'; end if;
  insert into public.idempotency_keys(owner_id,key,txn_id) values(_buyer,_idem,txn) on conflict(owner_id,key) do nothing;
  select txn_id into existing from public.idempotency_keys where owner_id=_buyer and key=_idem;
  if existing<>txn then return existing; end if;
  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;
  select owner_id into creator from public.channels where id=_channel for update;
  if creator is null then raise exception 'channel_not_found'; end if;
  if creator=_buyer then raise exception 'self_purchase_not_allowed'; end if;
  perform public.assert_spend_limit(_buyer,_amount);
  select balance into bal from public.balances where owner_id=_buyer and account='wallet' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;
  rate:=public.commission_rate(_channel,_kind);
  fee:=round(_amount*rate);
  rr:=public.referral_reward(creator,fee);
  net:=_amount-fee;
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
  values
    (txn,'wallet',_buyer,-_amount,_kind,_ref_type,_ref_id,null,
      jsonb_build_object('channel_id',_channel,'commission_rate',rate,'commission',fee,'referral_reward',rr)),
    (txn,'creator_pending',creator,net,_kind,_ref_type,_ref_id,now()+make_interval(hours=>hold_hours),
      jsonb_build_object('channel_id',_channel,'commission_rate',rate,'commission',fee)),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',_ref_type,_ref_id,null,
      jsonb_build_object('channel_id',_channel,'commission_rate',rate,'commission',fee,'referral_reward',rr));

  if rr>0 then
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
    select txn,'creator_pending',r.referrer_id,rr,'referral',_ref_type,_ref_id,now()+make_interval(hours=>hold_hours),
      jsonb_build_object('channel_id',_channel,'referral_for_creator',creator)
    from public.referrals r
    where r.referred_id=creator and r.status='active'
      and exists(select 1 from public.platform_settings where key='referral.enabled' and (value#>>'{}')::boolean=true)
    limit 1;
  end if;

  perform public.create_financial_receipt(_buyer,txn,_kind,_amount,jsonb_build_object('channel_id',_channel,'reference_type',_ref_type,'reference_id',_ref_id));
  perform public.create_financial_invoice(_buyer,txn,_kind,_amount,jsonb_build_object('channel_id',_channel,'reference_type',_ref_type,'reference_id',_ref_id));
  return txn;
end $$;

-- Include the channel on escrow-held ledger metadata for fan ranking.
create or replace function public._hold_escrow(
  _buyer uuid,_beneficiary uuid,_amount bigint,_source text,_source_id uuid,_idem text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare eid uuid:=gen_random_uuid(); txn uuid:=gen_random_uuid(); existing uuid; bal bigint; source_channel uuid;
begin
  if _amount<=0 or _buyer=_beneficiary then raise exception 'invalid_escrow'; end if;
  if _idem is null or char_length(trim(_idem))<8 then raise exception 'idempotency_key_required'; end if;
  insert into public.idempotency_keys(owner_id,key,txn_id) values(_buyer,_idem,txn) on conflict(owner_id,key) do nothing;
  select txn_id into existing from public.idempotency_keys where owner_id=_buyer and key=_idem;
  if existing<>txn then
    select id into eid from public.escrow_records where held_txn=existing limit 1;
    if eid is not null then return eid; end if;
    raise exception 'idempotency_conflict';
  end if;
  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;
  select balance into bal from public.balances where owner_id=_buyer and account='wallet' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;

  select case _source
    when 'auction' then (select channel_id from public.auctions where id=_source_id)
    when 'custom_request' then (select channel_id from public.custom_requests where id=_source_id)
    when 'product' then (select channel_id from public.orders where id=_source_id)
    else null
  end into source_channel;

  insert into public.escrow_records(id,buyer_id,beneficiary_id,source_type,source_id,amount,held_txn)
    values(eid,_buyer,_beneficiary,_source,_source_id,_amount,txn);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'wallet',_buyer,-_amount,'escrow_hold',_source,_source_id,jsonb_build_object('escrow',true,'channel_id',source_channel)),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'escrow_hold',_source,_source_id,jsonb_build_object('escrow',true,'channel_id',source_channel,'beneficiary_id',_beneficiary));
  return eid;
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
    (txn,'escrow','00000000-000000000-0000-0000-000000000000'::uuid,-e.amount,'escrow_release',e.source_type,e.source_id,null,jsonb_build_object('escrow_id',e.id)),
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
  update public.escrow_records set status='released',resolved_txn=txn,resolved_at=now() where id=_eid;
  return txn;
end $$;

create or replace function public.approve_agency(_agency uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'admin_required'; end if;
  update public.agencies set status='active' where id=_agency and status='pending';
end $$;

-- Security boundary: no direct browser mutations for financial business objects.
revoke all on function public._apply_promotion(uuid,text,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public._hold_escrow(uuid,uuid,bigint,text,uuid,text) from public,anon,authenticated;
revoke all on function public._release_escrow(uuid,text) from public,anon,authenticated;
revoke all on function public.release_due_business_escrows() from public,anon,authenticated;
revoke all on function public.close_auction(uuid) from public,anon,authenticated;

grant execute on function public.create_promotion(uuid,text,text,text,bigint,text,bigint,bigint,integer,smallint,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_promotion_active(uuid,boolean) to authenticated;
grant execute on function public.create_custom_request(uuid,text,bigint,text) to authenticated;
grant execute on function public.respond_custom_request(uuid,text,bigint,text) to authenticated;
grant execute on function public.update_custom_request(uuid,text) to authenticated;
grant execute on function public.accept_custom_request_counter(uuid,uuid) to authenticated;
grant execute on function public.dispute_custom_request(uuid,text) to authenticated;
grant execute on function public.create_auction_v2(uuid,text,text,bigint,bigint,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.create_auction(uuid,text,text,bigint,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.place_bid(uuid,bigint,text) to authenticated;
grant execute on function public.buy_bundle_v2(uuid,text,text) to authenticated;
grant execute on function public.buy_bundle(uuid,text) to authenticated;
grant execute on function public.create_product(uuid,text,text,bigint,integer) to authenticated;
grant execute on function public.update_product(uuid,text,text,bigint,integer,boolean) to authenticated;
grant execute on function public.create_order_v2(jsonb,text,text,text,text) to authenticated;
grant execute on function public.dispute_order(uuid,text) to authenticated;
grant execute on function public.record_login() to authenticated;
grant execute on function public.complete_mission(uuid,integer) to authenticated;
grant execute on function public.purchase_badge(uuid,text) to authenticated;
grant execute on function public.get_fan_ranking(uuid,integer) to authenticated;
grant execute on function public.refresh_rankings() to service_role;
grant execute on function public.refresh_creator_analytics() to service_role;
grant execute on function public.get_creator_analytics(uuid,integer) to authenticated;
grant execute on function public.add_fan_note(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_fan_tag(uuid,text) to authenticated;
grant execute on function public.assign_fan_tag(uuid,uuid) to authenticated;
grant execute on function public.get_fan_crm(uuid,integer) to authenticated;
grant execute on function public.create_referral_code(text) to authenticated;
grant execute on function public.redeem_referral(text) to authenticated;
grant execute on function public.create_agency(text) to authenticated;
grant execute on function public.invite_agency_creator(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.accept_agency_invite(uuid) to authenticated;
grant execute on function public.leave_agency(uuid) to authenticated;
grant execute on function public.get_agency_dashboard(uuid) to authenticated;
grant execute on function public.approve_agency(uuid) to authenticated;
grant execute on function public.purchase_premium_feature(uuid,uuid,text) to authenticated;
grant execute on function public.expire_premium_features() to service_role;
grant execute on function public.record_recommendation_event(uuid,text) to authenticated;
grant execute on function public.recommend_channels(integer) to authenticated;

-- Cron for business lifecycle.
select cron.unschedule(jobid) from cron.job where jobname in ('prively-close-auctions','prively-release-business-escrow','prively-expire-premium');
select cron.schedule('prively-close-auctions','* * * * *','select public.close_due_auctions();');
select cron.schedule('prively-release-business-escrow','*/15 * * * *','select public.release_due_business_escrows();');
select cron.schedule('prively-expire-premium','*/15 * * * *','select public.expire_premium_features();');

-- Replace unsafe direct admin policy pattern on Fase 9 tables with explicit, purpose-limited policies.
do $$
declare t text;
begin
  foreach t in array array[
    'custom_requests','custom_request_offers','escrow_records','auctions','bids','bundles','bundle_items','bundle_purchases',
    'promotions','promotion_redemptions','gifts_catalog','gifts_sent','products','orders','order_items',
    'giveaways','giveaway_entries','loyalty_points','missions','mission_progress','streaks','badges','user_badges',
    'creator_rankings_weekly','fan_rankings_weekly','creator_analytics_daily','fan_notes','fan_tags','fan_tag_assignments',
    'creator_goals','referrals','referral_codes','analytics_events','platform_settings','agencies','agency_members',
    'premium_features','user_premium_features','featured_channels','recommendation_events','channel_embeddings',
    'user_recommendation_profiles'
  ] loop
    execute format('drop policy if exists admin_manage_all on public.%I',t);
    execute format('drop policy if exists admin_read_all on public.%I',t);
  end loop;
end $$;

drop policy if exists custom_request_parties on public.custom_requests;
create policy custom_request_parties on public.custom_requests
for select to authenticated
using (client_id=auth.uid() or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists custom_request_offers_parties on public.custom_request_offers;
create policy custom_request_offers_parties on public.custom_request_offers
for select to authenticated
using (
  proposer_id=auth.uid()
  or exists(select 1 from public.custom_requests r where r.id=request_id and (r.client_id=auth.uid() or is_creator_of_channel(auth.uid(),r.channel_id)))
  or (select private.is_platform_admin())
);

drop policy if exists escrow_parties on public.escrow_records;
create policy escrow_parties on public.escrow_records
for select to authenticated
using (
  buyer_id=auth.uid() or beneficiary_id=auth.uid()
  or has_role(auth.uid(),'finance') or has_role(auth.uid(),'support')
  or has_role(auth.uid(),'compliance') or has_role(auth.uid(),'admin')
);

drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions
for select to authenticated
using (is_age_verified(auth.uid()) or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists bids_parties on public.bids;
create policy bids_parties on public.bids
for select to authenticated
using (
  bidder_id=auth.uid()
  or exists(select 1 from public.auctions a where a.id=auction_id and is_creator_of_channel(auth.uid(),a.channel_id))
  or (select private.is_platform_admin())
);

drop policy if exists bundles_read on public.bundles;
create policy bundles_read on public.bundles
for select to authenticated
using (is_age_verified(auth.uid()) or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists bundle_items_read on public.bundle_items;
create policy bundle_items_read on public.bundle_items
for select to authenticated
using (exists(select 1 from public.bundles b where b.id=bundle_id and (is_age_verified(auth.uid()) or is_creator_of_channel(auth.uid(),b.channel_id) or (select private.is_platform_admin()))));

drop policy if exists bundle_purchases_own on public.bundle_purchases;
create policy bundle_purchases_own on public.bundle_purchases
for select to authenticated
using (
  buyer_id=auth.uid()
  or exists(select 1 from public.bundles b where b.id=bundle_id and is_creator_of_channel(auth.uid(),b.channel_id))
  or (select private.is_platform_admin())
);

drop policy if exists gifts_catalog_read on public.gifts_catalog;
create policy gifts_catalog_read on public.gifts_catalog
for select to authenticated
using (active or (select private.is_platform_admin()));

drop policy if exists gifts_sent_parties on public.gifts_sent;
create policy gifts_sent_parties on public.gifts_sent
for select to authenticated
using (sender_id=auth.uid() or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists products_read on public.products;
create policy products_read on public.products
for select to authenticated
using (is_age_verified(auth.uid()) or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists products_owner_write on public.products;
create policy products_owner_write on public.products
for update to authenticated
using (is_creator_of_channel(auth.uid(),channel_id))
with check (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists products_owner_insert on public.products;
create policy products_owner_insert on public.products
for insert to authenticated
with check (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products
for delete to authenticated
using (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists orders_parties on public.orders;
create policy orders_parties on public.orders
for select to authenticated
using (buyer_id=auth.uid() or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists order_items_parties on public.order_items;
create policy order_items_parties on public.order_items
for select to authenticated
using (
  exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or is_creator_of_channel(auth.uid(),o.channel_id) or (select private.is_platform_admin())))
);

drop policy if exists giveaways_read on public.giveaways;
create policy giveaways_read on public.giveaways
for select to authenticated
using (is_age_verified(auth.uid()) or is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists giveaway_entries_parties on public.giveaway_entries;
create policy giveaway_entries_parties on public.giveaway_entries
for select to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.giveaways g where g.id=giveaway_id and is_creator_of_channel(auth.uid(),g.channel_id))
  or (select private.is_platform_admin())
);

drop policy if exists loyalty_own on public.loyalty_points;
create policy loyalty_own on public.loyalty_points
for select to authenticated using (user_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions
for select to authenticated using (active or (select private.is_platform_admin()));

drop policy if exists mission_progress_own on public.mission_progress;
create policy mission_progress_own on public.mission_progress
for select to authenticated using (user_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists streak_own on public.streaks;
create policy streak_own on public.streaks
for select to authenticated using (user_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges
for select to authenticated using (active or (select private.is_platform_admin()));

drop policy if exists user_badges_own on public.user_badges;
create policy user_badges_own on public.user_badges
for select to authenticated using (user_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists creator_rankings_read on public.creator_rankings_weekly;
create policy creator_rankings_read on public.creator_rankings_weekly
for select to authenticated using (true);

drop policy if exists fan_rankings_read on public.fan_rankings_weekly;
drop policy if exists fan_ranking_no_direct_client_read on public.fan_rankings_weekly;
revoke all on public.fan_rankings_weekly from authenticated;

drop policy if exists creator_analytics_read on public.creator_analytics_daily;
create policy creator_analytics_read on public.creator_analytics_daily
for select to authenticated
using (is_creator_of_channel(auth.uid(),channel_id) or (select private.is_platform_admin()));

drop policy if exists fan_notes_read on public.fan_notes;
create policy fan_notes_read on public.fan_notes
for select to authenticated using (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists fan_tags_read on public.fan_tags;
create policy fan_tags_read on public.fan_tags
for select to authenticated using (is_creator_of_channel(auth.uid(),channel_id));

drop policy if exists fan_tag_assignments_read on public.fan_tag_assignments;
create policy fan_tag_assignments_read on public.fan_tag_assignments
for select to authenticated
using (exists(select 1 from public.fan_tags t where t.id=tag_id and is_creator_of_channel(auth.uid(),t.channel_id)));

drop policy if exists referrals_party on public.referrals;
create policy referrals_party on public.referrals
for select to authenticated using (referrer_id=auth.uid() or referred_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists referral_codes_owner on public.referral_codes;
create policy referral_codes_owner on public.referral_codes
for select to authenticated using (creator_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists analytics_events_own on public.analytics_events;
revoke all on public.analytics_events from authenticated;

drop policy if exists settings_admin on public.platform_settings;
create policy settings_admin on public.platform_settings
for select to authenticated using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'finance'));

drop policy if exists agencies_owner_read on public.agencies;
create policy agencies_owner_read on public.agencies
for select to authenticated using (owner_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists agency_members_parties on public.agency_members;
create policy agency_members_parties on public.agency_members
for select to authenticated
using (creator_id=auth.uid() or exists(select 1 from public.agencies a where a.id=agency_id and a.owner_id=auth.uid()) or (select private.is_platform_admin()));

drop policy if exists premium_features_read on public.premium_features;
create policy premium_features_read on public.premium_features
for select to authenticated using (active or (select private.is_platform_admin()));

drop policy if exists user_premium_features_own on public.user_premium_features;
create policy user_premium_features_own on public.user_premium_features
for select to authenticated using (user_id=auth.uid() or (select private.is_platform_admin()));

drop policy if exists featured_channels_read on public.featured_channels;
create policy featured_channels_read on public.featured_channels
for select to authenticated
using (status='active' and starts_at<=now() and ends_at>now() or (select private.is_platform_admin()));

drop policy if exists recommendation_events_own on public.recommendation_events;
create policy recommendation_events_own on public.recommendation_events
for insert to authenticated with check (user_id=auth.uid());
revoke select on public.recommendation_events from authenticated;

revoke select on public.channel_embeddings from authenticated;
revoke select on public.user_recommendation_profiles from authenticated;

-- Sensitive orders: browser receives no plaintext/ciphertext shipping columns.
revoke select on public.orders from authenticated;
grant select (
  id,buyer_id,channel_id,total,status,escrow_id,idempotency_key,
  shipping_schema_version,discount_amount,promotion_id,created_at,updated_at
) on public.orders to authenticated;

-- Public clients cannot close auctions, refresh business aggregates or mutate admin-only catalogs through direct SQL.
revoke all on function public.award_badges() from public,anon,authenticated;
revoke all on function public.draw_giveaway(uuid) from public,anon,authenticated;
revoke all on function public.refresh_creator_analytics() from public,anon,authenticated;
revoke all on function public.refresh_rankings() from public,anon,authenticated;
revoke all on function public.expire_premium_features() from public,anon,authenticated;
revoke all on function public.approve_agency(uuid) from public,anon,authenticated;
grant execute on function public.refresh_creator_analytics() to service_role;
grant execute on function public.refresh_rankings() to service_role;
grant execute on function public.expire_premium_features() to service_role;
grant execute on function public.draw_giveaway(uuid) to service_role;
grant execute on function public.award_badges() to service_role;

-- Existing giveaway draw path is internal; cron/runtime owns it.
