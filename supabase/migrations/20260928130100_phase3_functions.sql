create or replace function public.protect_profile_security_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.internal_write',true)='on' then return new; end if;
  if coalesce(old.age_verified_at::text,'')<>coalesce(new.age_verified_at::text,'')
     or old.status<>new.status
     or coalesce(old.self_excluded_until::text,'')<>coalesce(new.self_excluded_until::text,'') then
    raise exception 'protected_profile_fields';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_protected_fields on public.profiles;
create trigger trg_profiles_protected_fields before update on public.profiles
for each row execute function public.protect_profile_security_fields();

create or replace function public.approve_kyc(_kyc uuid,_approved boolean,_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare k public.kyc_verifications;
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'compliance')) then raise exception 'forbidden'; end if;
  select * into k from public.kyc_verifications where id=_kyc for update;
  if not found then raise exception 'kyc_not_found'; end if;
  perform set_config('app.internal_write','on',true);
  update public.kyc_verifications
  set status=case when _approved then 'approved' else 'rejected' end,
      reviewed_by=auth.uid(),reviewed_at=now(),reason=nullif(trim(_reason),'')
  where id=k.id;
  update public.profiles
  set status=case when _approved then 'active' else 'pending' end,
      age_verified_at=case when _approved then now() else age_verified_at end
  where id=k.user_id;
  if _approved then
    insert into public.user_roles(user_id,role) values(k.user_id,'creator') on conflict do nothing;
  end if;
end $$;

create or replace function public.get_kyc_status()
returns text language sql stable security definer set search_path=public as $$
select status from public.kyc_verifications where user_id=auth.uid() order by created_at desc limit 1;
$$;

create or replace function public.ledger_apply()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.balances
  set balance=balance+new.amount
  where owner_id=new.owner_id and account=new.account;
  if not found then
    insert into public.balances(owner_id,account,balance)
    values(new.owner_id,new.account,new.amount);
  end if;
  return new;
end $$;

drop trigger if exists trg_ledger_apply on public.ledger_entries;
create trigger trg_ledger_apply after insert on public.ledger_entries
for each row execute function public.ledger_apply();

create or replace function public.ledger_immutable()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'ledger_is_append_only'; end $$;

create trigger trg_ledger_no_update
before update or delete on public.ledger_entries
for each row execute function public.ledger_immutable();

create or replace function public.assert_ledger_txn_balanced()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.ledger_entries where txn_id=new.txn_id group by txn_id having sum(amount)<>0) then
    raise exception 'unbalanced_ledger_transaction:%',new.txn_id;
  end if;
  return null;
end $$;

create constraint trigger trg_ledger_txn_balanced
after insert on public.ledger_entries
deferrable initially deferred
for each row execute function public.assert_ledger_txn_balanced();

create or replace function public.commission_rate(_channel uuid,_kind text)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare j jsonb; d numeric; k numeric;
begin
  select value into j from public.platform_settings where key='commission.by_kind';
  select (value #>> '{}')::numeric into d from public.platform_settings where key='commission.default';
  if j ? _kind then k:=(j->>_kind)::numeric; end if;
  return greatest(0,least(1,coalesce(k,d,0.30)));
end $$;

create or replace function public.assert_spend_limit(_uid uuid,_amount bigint)
returns void language plpgsql security definer set search_path=public as $$
declare l public.spend_limits; d bigint; w bigint; m bigint;
begin
  select * into l from public.spend_limits where user_id=_uid;
  if not found then return; end if;
  select
    coalesce(sum(-amount) filter(where created_at>=now()-interval '1 day'),0),
    coalesce(sum(-amount) filter(where created_at>=now()-interval '7 day'),0),
    coalesce(sum(-amount) filter(where created_at>=now()-interval '30 day'),0)
  into d,w,m
  from public.ledger_entries
  where owner_id=_uid and account='wallet' and amount<0 and kind not in('escrow_hold');
  if l.daily is not null and d+_amount>l.daily then raise exception 'daily_spend_limit'; end if;
  if l.weekly is not null and w+_amount>l.weekly then raise exception 'weekly_spend_limit'; end if;
  if l.monthly is not null and m+_amount>l.monthly then raise exception 'monthly_spend_limit'; end if;
end $$;

create or replace function public.referral_reward(_creator uuid,_fee bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare enabled boolean:=false; share numeric:=0; days integer:=0;
begin
  select coalesce((value#>>'{}')::boolean,false) into enabled from public.platform_settings where key='referral.enabled';
  select coalesce((value#>>'{}')::numeric,0) into share from public.platform_settings where key='referral.share_rate';
  select coalesce((value#>>'{}')::integer,0) into days from public.platform_settings where key='referral.window_days';
  if not enabled or share<=0 or days<=0 then return 0; end if;
  if not exists(select 1 from public.referrals where referred_id=_creator and status='active' and activated_at>=now()-make_interval(days=>days)) then return 0; end if;
  return greatest(0,least(_fee,round(_fee*share)));
end $$;

create or replace function public._spend_on_channel(
  _buyer uuid,_channel uuid,_amount bigint,_kind text,_ref_type text,_ref_id uuid,_idem text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare creator uuid; bal bigint; rate numeric; fee bigint; net bigint; rr bigint; txn uuid;
begin
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  select txn_id into txn from public.idempotency_keys where owner_id=_buyer and key=_idem;
  if txn is not null then return txn; end if;
  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;
  select owner_id into creator from public.channels where id=_channel;
  if creator is null then raise exception 'channel_not_found'; end if;
  if creator=_buyer then raise exception 'self_purchase_not_allowed'; end if;
  perform public.assert_spend_limit(_buyer,_amount);
  select balance into bal from public.balances where owner_id=_buyer and account='wallet' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;
  txn:=gen_random_uuid();
  rate:=public.commission_rate(_channel,_kind);
  fee:=round(_amount*rate);
  net:=_amount-fee;
  rr:=public.referral_reward(creator,fee);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at)
  values
    (txn,'wallet',_buyer,-_amount,_kind,_ref_type,_ref_id,null),
    (txn,'creator_pending',creator,net,_kind,_ref_type,_ref_id,now()+make_interval(hours=>coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72))),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',_ref_type,_ref_id,null);
  if rr>0 then
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at)
    select txn,'creator_pending',referrer.referrer_id,rr,'referral',_ref_type,_ref_id,
      now()+make_interval(hours=>coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72))
    from public.referrals referrer
    where referrer.referred_id=creator and referrer.status='active'
    limit 1;
  end if;
  insert into public.idempotency_keys(owner_id,key,txn_id) values(_buyer,_idem,txn);
  return txn;
end $$;

create or replace function public.spend_on_channel(_channel uuid,_amount bigint,_kind text,_ref_type text,_ref_id uuid,_idem text)
returns uuid language sql security definer set search_path=public as $$
select public._spend_on_channel(auth.uid(),_channel,_amount,_kind,_ref_type,_ref_id,_idem);
$$;

create or replace function public.send_tip(_channel uuid,_amount bigint,_message text,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid(); txn uuid;
begin
  txn:=public._spend_on_channel(auth.uid(),_channel,_amount,'tip','tip',id,'tip:'||id::text||':'||_idem);
  insert into public.tips(id,buyer_id,channel_id,amount,message,txn_id) values(id,auth.uid(),_channel,_amount,nullif(trim(_message),''),txn);
  return id;
end $$;

create or replace function public.send_gift(_channel uuid,_gift uuid,_quantity integer,_message text,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare g public.gifts_catalog; id uuid:=gen_random_uuid(); txn uuid;
begin
  select * into g from public.gifts_catalog where id=_gift and active=true;
  if not found then raise exception 'gift_not_available'; end if;
  if _quantity<1 or _quantity>100 then raise exception 'invalid_quantity'; end if;
  txn:=public._spend_on_channel(auth.uid(),_channel,g.price*_quantity,'gift','gift',id,'gift:'||id::text||':'||_idem);
  insert into public.gifts_sent(id,sender_id,channel_id,gift_id,quantity,message,txn_id)
  values(id,auth.uid(),_channel,_gift,_quantity,nullif(trim(_message),''),txn);
  return id;
end $$;

create or replace function public._hold_escrow(_buyer uuid,_beneficiary uuid,_amount bigint,_source text,_source_id uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare txn uuid; eid uuid:=gen_random_uuid(); bal bigint;
begin
  if _amount<=0 or _buyer=_beneficiary then raise exception 'invalid_escrow'; end if;
  select txn_id into txn from public.idempotency_keys where owner_id=_buyer and key=_idem;
  if txn is not null then select id into eid from public.escrow_records where held_txn=txn limit 1; return eid; end if;
  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;
  perform public.assert_spend_limit(_buyer,_amount);
  select balance into bal from public.balances where owner_id=_buyer and account='wallet' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;
  txn:=gen_random_uuid();
  insert into public.escrow_records(id,buyer_id,beneficiary_id,source_type,source_id,amount,held_txn)
  values(eid,_buyer,_beneficiary,_source,_source_id,_amount,txn);
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (txn,'wallet',_buyer,-_amount,'escrow_hold',_source,_source_id),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'escrow_hold',_source,_source_id);
  insert into public.idempotency_keys(owner_id,key,txn_id) values(_buyer,_idem,txn);
  return eid;
end $$;

create or replace function public._release_escrow(_eid uuid,_source text)
returns uuid language plpgsql security definer set search_path=public as $$
declare e public.escrow_records; ch uuid; rate numeric; fee bigint; net bigint; rr bigint; txn uuid:=gen_random_uuid();
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;
  select id into ch from public.channels where owner_id=e.beneficiary_id order by created_at limit 1;
  rate:=public.commission_rate(ch,e.source_type);
  fee:=round(e.amount*rate); net:=e.amount-fee; rr:=public.referral_reward(e.beneficiary_id,fee);
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_release',e.source_type,e.source_id,null),
    (txn,'creator_pending',e.beneficiary_id,net,'escrow_release',e.source_type,e.source_id,now()+make_interval(hours=>coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72))),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',e.source_type,e.source_id,null);
  if rr>0 then
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at)
    select txn,'creator_pending',r.referrer_id,rr,'referral',e.source_type,e.source_id,
      now()+make_interval(hours=>coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72))
    from public.referrals r where r.referred_id=e.beneficiary_id and r.status='active' limit 1;
  end if;
  update public.escrow_records set status='released',resolved_txn=txn,resolved_at=now() where id=_eid;
  return txn;
end $$;

create or replace function public._refund_escrow(_eid uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare e public.escrow_records; txn uuid:=gen_random_uuid();
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_refund',e.source_type,e.source_id),
    (txn,'wallet',e.buyer_id,e.amount,'refund',e.source_type,e.source_id);
  update public.escrow_records set status='refunded',resolved_txn=txn,resolved_at=now() where id=_eid;
  return txn;
end $$;

create or replace function public.create_custom_request(_channel uuid,_brief text,_budget bigint,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; creator uuid; escrow uuid;
begin
  select id into rid from public.custom_requests where client_id=auth.uid() and idempotency_key=_idem;
  if rid is not null then return rid; end if;
  select owner_id into creator from public.channels where id=_channel;
  if creator is null or not public.has_role(creator,'creator') then raise exception 'creator_not_available'; end if;
  insert into public.custom_requests(client_id,channel_id,brief,budget,idempotency_key)
  values(auth.uid(),_channel,trim(_brief),_budget,_idem) returning id into rid;
  escrow:=public._hold_escrow(auth.uid(),creator,_budget,'custom_request',rid,'custom_request:'||rid::text);
  update public.custom_requests set escrow_id=escrow where id=rid;
  return rid;
end $$;

create or replace function public.update_custom_request(_request uuid,_status text)
returns void language plpgsql security definer set search_path=public as $$
declare r public.custom_requests;
begin
  select * into r from public.custom_requests where id=_request for update;
  if not found or not public.is_creator_of_channel(auth.uid(),r.channel_id) then raise exception 'forbidden'; end if;
  if _status not in('accepted','in_progress','delivered','declined') then raise exception 'invalid_status'; end if;
  update public.custom_requests set status=_status where id=_request;
  if _status='declined' and r.escrow_id is not null then perform public._refund_escrow(r.escrow_id); update public.custom_requests set status='refunded' where id=_request; end if;
end $$;

create or replace function public.release_custom_request(_request uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.custom_requests;
begin
  select * into r from public.custom_requests where id=_request for update;
  if not found or r.client_id<>auth.uid() or r.status<>'delivered' or r.escrow_id is null then raise exception 'request_not_ready'; end if;
  perform public._release_escrow(r.escrow_id,'custom_request');
  update public.custom_requests set status='released' where id=_request;
end $$;

create or replace function public.create_auction(_channel uuid,_title text,_description text,_minimum bigint,_starts timestamptz,_ends timestamptz,_post uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if _ends<=_starts or _ends<=now() or _minimum<=0 then raise exception 'invalid_auction'; end if;
  insert into public.auctions(id,channel_id,post_id,title,description,starts_at,ends_at,minimum_bid,status)
  values(id,_channel,_post,trim(_title),nullif(trim(_description),''),_starts,_ends,_minimum,case when _starts<=now() then 'live' else 'scheduled' end);
  return id;
end $$;

create or replace function public.place_bid(_auction uuid,_amount bigint,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.auctions; high public.bids; eid uuid; bid uuid:=gen_random_uuid(); old_txn uuid; 
begin
  select * into a from public.auctions where id=_auction for update;
  if not found or a.ends_at<=now() or a.status not in('scheduled','live') then raise exception 'auction_not_open'; end if;
  if a.starts_at>now() then raise exception 'auction_not_started'; end if;
  if _amount<a.minimum_bid then raise exception 'bid_below_minimum'; end if;
  select b.id into bid from public.bids b join public.escrow_records e on e.id=b.escrow_id
    where b.auction_id=a.id and b.bidder_id=auth.uid() and e.held_txn in(select txn_id from public.idempotency_keys where owner_id=auth.uid() and key='auction:'||a.id::text||':'||_idem) limit 1;
  if bid is not null then return bid; end if;
  select * into high from public.bids where auction_id=a.id and status='active' order by amount desc,created_at desc limit 1;
  if high.id is not null and _amount<=high.amount then raise exception 'bid_not_high_enough'; end if;
  eid:=public._hold_escrow(auth.uid(),(select owner_id from public.channels where id=a.channel_id),_amount,'auction',a.id,'auction:'||a.id::text||':'||_idem);
  insert into public.bids(id,auction_id,bidder_id,amount,escrow_id) values(bid,a.id,auth.uid(),_amount,eid);
  if high.id is not null then
    update public.bids set status='outbid' where id=high.id;
    perform public._refund_escrow(high.escrow_id);
  end if;
  if a.ends_at-now()<=interval '2 minutes' then update public.auctions set ends_at=a.ends_at+interval '2 minutes',status='live' where id=a.id;
  else update public.auctions set status='live' where id=a.id; end if;
  return bid;
end $$;

create or replace function public.close_auction(_auction uuid)
returns void language plpgsql security definer set search_path=public as $$
declare a public.auctions; w public.bids; b public.bids;
begin
  select * into a from public.auctions where id=_auction for update;
  if not found or a.status='closed' then return; end if;
  if now()<a.ends_at then raise exception 'auction_not_finished'; end if;
  select * into w from public.bids where auction_id=a.id and status='active' order by amount desc,created_at asc limit 1;
  if w.id is not null then
    perform public._release_escrow(w.escrow_id,'auction');
    update public.bids set status='won' where id=w.id;
    update public.auctions set winner_bid_id=w.id,status='closed' where id=a.id;
  else update public.auctions set status='closed' where id=a.id; end if;
  for b in select * from public.bids where auction_id=a.id and status='active'
  loop
    update public.bids set status='refunded' where id=b.id;
    perform public._refund_escrow(b.escrow_id);
  end loop;
end $$;

create or replace function public.create_bundle(_channel uuid,_name text,_description text,_price bigint,_post_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) or coalesce(array_length(_post_ids,1),0)=0 or _price<=0 then raise exception 'invalid_bundle'; end if;
  if exists(select 1 from public.posts where id=any(_post_ids) and channel_id<>_channel) then raise exception 'bundle_channel_mismatch'; end if;
  insert into public.bundles(id,channel_id,name,description,price) values(id,_channel,trim(_name),nullif(trim(_description),''),_price);
  insert into public.bundle_items(bundle_id,post_id) select id,unnest(_post_ids);
  return id;
end $$;

create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare p public.posts; c public.channels;
begin
  select * into p from public.posts where id=_post_id and status='published' and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now());
  if not found then return false; end if;
  select * into c from public.channels where id=p.channel_id;
  if _uid=c.owner_id then return true; end if;
  if not public.is_age_verified(_uid) then return false; end if;
  if exists(select 1 from public.blocks where (owner_id=c.owner_id and blocked_user_id=_uid) or (owner_id=_uid and blocked_user_id=c.owner_id)) then return false; end if;
  return case p.visibility
    when 'public' then true
    when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
      or exists(select 1 from public.bundle_purchases bp join public.bundle_items bi on bi.bundle_id=bp.bundle_id where bp.buyer_id=_uid and bp.status='active' and bi.post_id=p.id)
    else false
  end;
end $$;

create or replace function public.buy_bundle(_bundle uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.bundles; id uuid; txn uuid;
begin
  select * into b from public.bundles where id=_bundle for update;
  if not found or b.status<>'active' or (b.expires_at is not null and b.expires_at<=now()) then raise exception 'bundle_not_available'; end if;
  select id into id from public.bundle_purchases where buyer_id=auth.uid() and bundle_id=_bundle;
  if id is not null then return id; end if;
  id:=gen_random_uuid();
  txn:=public._spend_on_channel(auth.uid(),b.channel_id,b.price,'bundle','bundle',b.id,'bundle:'||b.id::text||':'||_idem);
  insert into public.bundle_purchases(id,buyer_id,bundle_id,price_paid,txn_id) values(id,auth.uid(),b.id,b.price,txn);
  return id;
end $$;

create or replace function public.create_order(_items jsonb,_shipping jsonb,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare row_item jsonb; p public.products; oid uuid; channel uuid; total bigint:=0; qty int; eid uuid;
begin
  select id into oid from public.orders where buyer_id=auth.uid() and idempotency_key=_idem;
  if oid is not null then return oid; end if;
  if jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'order_items_required'; end if;
  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=coalesce((row_item->>'quantity')::int,0);
    if qty<=0 then raise exception 'invalid_quantity'; end if;
    select * into p from public.products where id=(row_item->>'product_id')::uuid and active for update;
    if not found or p.stock<qty then raise exception 'product_unavailable'; end if;
    if channel is null then channel:=p.channel_id; elsif channel<>p.channel_id then raise exception 'single_channel_order'; end if;
    total:=total+(p.price*qty);
  end loop;
  oid:=gen_random_uuid();
  insert into public.orders(id,buyer_id,channel_id,total,idempotency_key,shipping) values(oid,auth.uid(),channel,total,_idem,coalesce(_shipping,'{}'::jsonb));
  for row_item in select * from jsonb_array_elements(_items)
  loop
    qty:=(row_item->>'quantity')::int;
    select * into p from public.products where id=(row_item->>'product_id')::uuid for update;
    insert into public.order_items(order_id,product_id,quantity,unit_price) values(oid,p.id,qty,p.price);
    update public.products set stock=stock-qty where id=p.id;
  end loop;
  eid:=public._hold_escrow(auth.uid(),(select owner_id from public.channels where id=channel),total,'product',oid,'order:'||oid::text);
  update public.orders set escrow_id=eid where id=oid;
  return oid;
end $$;

create or replace function public.update_order(_order uuid,_status text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
  select * into o from public.orders where id=_order for update;
  if not found or not public.is_creator_of_channel(auth.uid(),o.channel_id) or _status not in('accepted','shipped','delivered') then raise exception 'forbidden'; end if;
  update public.orders set status=_status where id=_order;
end $$;

create or replace function public.confirm_order(_order uuid)
returns void language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
  select * into o from public.orders where id=_order for update;
  if not found or o.buyer_id<>auth.uid() or o.status<>'delivered' or o.escrow_id is null then raise exception 'order_not_ready'; end if;
  perform public._release_escrow(o.escrow_id,'product');
  update public.orders set status='released' where id=_order;
end $$;

create or replace function public.create_live_session(_channel uuid,_mode text,_title text,_description text,_price bigint,_scheduled_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) then raise exception 'forbidden'; end if;
  if _mode='paid' and coalesce(_price,0)<=0 then raise exception 'paid_live_requires_price'; end if;
  insert into public.live_sessions(id,channel_id,mode,title,description,price,scheduled_at,status,room_name)
  values(id,_channel,_mode,trim(_title),nullif(trim(_description),''),nullif(_price,0),_scheduled_at,case when _scheduled_at is null or _scheduled_at<=now() then 'live' else 'scheduled' end,'prively-live-'||id::text);
  return id;
end $$;

create or replace function public.buy_live_ticket(_session uuid,_idem text)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.live_sessions; id uuid; txn uuid;
begin
  select * into s from public.live_sessions where id=_session for update;
  if not found or s.mode<>'paid' or s.status not in('scheduled','live') then raise exception 'live_not_available'; end if;
  select id into id from public.live_tickets where live_session_id=_session and buyer_id=auth.uid();
  if id is not null then return id; end if;
  id:=gen_random_uuid();
  txn:=public._spend_on_channel(auth.uid(),s.channel_id,s.price,'live_ticket','live_session',s.id,'live:'||s.id::text||':'||_idem);
  insert into public.live_tickets(id,live_session_id,buyer_id,price_paid,txn_id) values(id,s.id,auth.uid(),s.price,txn);
  return id;
end $$;

create or replace function public.update_call_rates(_channel uuid,_audio bigint,_video bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) or (_audio is not null and _audio<=0) or (_video is not null and _video<=0) then raise exception 'invalid_call_rates'; end if;
  update public.channels set call_audio_price=_audio,call_video_price=_video where id=_channel;
end $$;

create or replace function public.create_call_session(_channel uuid,_kind text)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid(); owner uuid; rate bigint;
begin
  if not public.is_age_verified(auth.uid()) or _kind not in('audio','video') then raise exception 'forbidden'; end if;
  select owner_id,case when _kind='audio' then call_audio_price else call_video_price end into owner,rate from public.channels where id=_channel;
  if owner is null or rate is null then raise exception 'call_price_not_configured'; end if;
  insert into public.call_sessions(id,channel_id,client_id,kind,per_minute_price,room_name)
  values(id,_channel,auth.uid(),_kind,rate,'prively-call-'||id::text);
  return id;
end $$;

create or replace function public.issue_live_access(_session uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.live_sessions; c public.call_sessions; uid uuid:=auth.uid();
begin
  if not public.is_age_verified(uid) then raise exception 'age_not_verified'; end if;
  select * into s from public.live_sessions where id=_session;
  if found then
    if s.status not in('scheduled','live') or (s.scheduled_at is not null and s.scheduled_at>now()) then raise exception 'live_not_available'; end if;
    if (select owner_id from public.channels where id=s.channel_id)<>uid and s.mode='paid'
       and not exists(select 1 from public.live_tickets where live_session_id=s.id and buyer_id=uid) then
      raise exception 'live_ticket_required';
    end if;
    update public.live_sessions set status='live',started_at=coalesce(started_at,now()) where id=s.id;
    return jsonb_build_object('kind','live','session_id',s.id,'room_name',s.room_name,'mode',s.mode,'role',case when (select owner_id from public.channels where id=s.channel_id)=uid then 'host' else 'viewer' end);
  end if;
  select * into c from public.call_sessions where id=_session;
  if found then
    if c.status in('ended','cancelled') or (c.client_id<>uid and not public.is_creator_of_channel(uid,c.channel_id)) then raise exception 'call_not_available'; end if;
    if c.client_id=uid and coalesce((select balance from public.balances where owner_id=uid and account='wallet'),0)<c.per_minute_price then raise exception 'insufficient_funds'; end if;
    update public.call_sessions set status='active',started_at=coalesce(started_at,now()) where id=c.id;
    return jsonb_build_object('kind','call','session_id',c.id,'room_name',c.room_name,'mode',c.kind,'role',case when c.client_id=uid then 'caller' else 'host' end,'per_minute_price',c.per_minute_price);
  end if;
  raise exception 'session_not_found';
end $$;

create or replace function public.bill_active_calls()
returns integer language plpgsql security definer set search_path=public as $$
declare c public.call_sessions; minutes int; m int; billed int:=0;
begin
  for c in select * from public.call_sessions where status='active' and started_at is not null for update
  loop
    minutes:=floor(extract(epoch from(now()-c.started_at))/60);
    if minutes<=c.billed_minutes then continue; end if;
    begin
      for m in c.billed_minutes+1..minutes loop
        perform public._spend_on_channel(c.client_id,c.channel_id,c.per_minute_price,'call_minute','call_session',c.id,'call:'||c.id::text||':minute:'||m::text);
        billed:=billed+1;
      end loop;
      update public.call_sessions set billed_minutes=minutes where id=c.id;
    exception when others then
      update public.call_sessions set status='ended',ended_at=now() where id=c.id;
    end;
  end loop;
  return billed;
end $$;

create or replace function public.enter_giveaway(_giveaway uuid)
returns void language plpgsql security definer set search_path=public as $$
declare g public.giveaways;
begin
  select * into g from public.giveaways where id=_giveaway for update;
  if not found or now()<g.starts_at or now()>=g.ends_at or g.status not in('scheduled','open') then raise exception 'giveaway_not_open'; end if;
  if g.requires_subscription and not public.has_active_subscription(auth.uid(),g.channel_id) then raise exception 'subscription_required'; end if;
  update public.giveaways set status='open' where id=g.id and status='scheduled';
  insert into public.giveaway_entries(giveaway_id,user_id) values(g.id,auth.uid()) on conflict do nothing;
end $$;

create or replace function public.create_giveaway(_channel uuid,_title text,_description text,_starts timestamptz,_ends timestamptz,_winner_count smallint,_requires_subscription boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) or _ends<=_starts or _winner_count<1 then raise exception 'invalid_giveaway'; end if;
  insert into public.giveaways(id,channel_id,title,description,starts_at,ends_at,winner_count,requires_subscription,status)
  values(id,_channel,trim(_title),nullif(trim(_description),''),_starts,_ends,_winner_count,_requires_subscription,case when _starts<=now() then 'open' else 'scheduled' end);
  return id;
end $$;

create or replace function public.draw_giveaway(_giveaway uuid)
returns setof uuid language plpgsql security definer set search_path=public as $$
declare g public.giveaways;
begin
  select * into g from public.giveaways where id=_giveaway for update;
  if not found or not public.is_creator_of_channel(auth.uid(),g.channel_id) then raise exception 'forbidden'; end if;
  if now()<g.ends_at then raise exception 'giveaway_not_finished'; end if;
  if g.status='drawn' then return query select user_id from public.giveaway_entries where giveaway_id=g.id and winner; return; end if;
  update public.giveaways set draw_seed=encode(gen_random_bytes(32),'hex'),status='drawn' where id=g.id returning * into g;
  with ranked as(select user_id,row_number() over(order by digest(g.draw_seed||user_id::text,'sha256')) rn from public.giveaway_entries where giveaway_id=g.id)
  update public.giveaway_entries e set winner=(r.rn<=g.winner_count) from ranked r where e.giveaway_id=g.id and e.user_id=r.user_id;
  return query select user_id from public.giveaway_entries where giveaway_id=g.id and winner;
end $$;

create or replace function public.create_poll(_channel uuid,_question text,_closes timestamptz,_options text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid(); o text; n int:=0;
begin
  if not public.is_creator_of_channel(auth.uid(),_channel) or coalesce(array_length(_options,1),0)<2 then raise exception 'invalid_poll'; end if;
  insert into public.polls(id,channel_id,question,closes_at,status) values(id,_channel,trim(_question),_closes,'open');
  foreach o in array _options loop
    n:=n+1; insert into public.poll_options(poll_id,label,sort_order) values(id,trim(o),n);
  end loop;
  return id;
end $$;

create or replace function public.cast_poll_vote(_poll uuid,_option uuid)
returns void language plpgsql security definer set search_path=public as $$
declare p public.polls;
begin
  select * into p from public.polls where id=_poll for update;
  if not found or p.status<>'open' or (p.closes_at is not null and p.closes_at<=now()) then raise exception 'poll_closed'; end if;
  if not exists(select 1 from public.poll_options where id=_option and poll_id=_poll) then raise exception 'invalid_option'; end if;
  insert into public.poll_votes(poll_id,option_id,user_id) values(_poll,_option,auth.uid());
end $$;

create or replace function public.award_configured_points(_uid uuid,_kind text,_ref_type text default null,_ref_id uuid default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare pts bigint; configured boolean:=false;
begin
  select coalesce((value#>>'{}')::boolean,false) into configured from public.platform_settings where key='loyalty.configured';
  if not configured then return 0; end if;
  select (value->>_kind)::bigint into pts from public.platform_settings where key='loyalty.points';
  if coalesce(pts,0)<=0 then return 0; end if;
  insert into public.loyalty_points(user_id,points,lifetime_points) values(_uid,pts,pts)
  on conflict(user_id) do update set points=public.loyalty_points.points+pts,lifetime_points=public.loyalty_points.lifetime_points+pts,updated_at=now();
  insert into public.point_events(user_id,points,kind,ref_type,ref_id) values(_uid,pts,_kind,_ref_type,_ref_id);
  return pts;
end $$;

create or replace function public.record_login()
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.streaks; today date:=current_date;
begin
  select * into s from public.streaks where user_id=auth.uid() for update;
  if not found then insert into public.streaks(user_id,current_days,longest_days,last_day) values(auth.uid(),1,1,today);
  elsif s.last_day=today then null;
  elsif s.last_day=today-1 then
    update public.streaks set current_days=current_days+1,longest_days=greatest(longest_days,current_days+1),last_day=today where user_id=auth.uid();
    perform public.award_configured_points(auth.uid(),'login','streak',null);
  else
    update public.streaks set current_days=1,last_day=today where user_id=auth.uid();
    perform public.award_configured_points(auth.uid(),'login','streak',null);
  end if;
  return jsonb_build_object('current_days',(select current_days from public.streaks where user_id=auth.uid()),'longest_days',(select longest_days from public.streaks where user_id=auth.uid()),'points',(select points from public.loyalty_points where user_id=auth.uid()));
end $$;

create or replace function public.get_loyalty_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare levels jsonb; pts bigint:=coalesce((select lifetime_points from public.loyalty_points where user_id=auth.uid()),0); level_name text:=null;
begin
  select value into levels from public.platform_settings where key='loyalty.levels';
  if jsonb_typeof(levels)='array' then
    select value->>'name' into level_name from jsonb_array_elements(levels) value
    where coalesce((value->>'min_points')::bigint,0)<=pts
    order by (value->>'min_points')::bigint desc limit 1;
  end if;
  return jsonb_build_object('points',coalesce((select points from public.loyalty_points where user_id=auth.uid()),0),'lifetime_points',pts,'level',level_name,'current_streak',coalesce((select current_days from public.streaks where user_id=auth.uid()),0));
end $$;

create or replace function public.award_badges()
returns integer language plpgsql security definer set search_path=public as $$
declare u record; b record; n int:=0;
begin
  for b in select * from public.badges where active and points_threshold is not null loop
    for u in select user_id,lifetime_points from public.loyalty_points where lifetime_points>=b.points_threshold loop
      insert into public.user_badges(user_id,badge_id) values(u.user_id,b.id) on conflict do nothing;
      if found then n:=n+1; end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.refresh_rankings()
returns void language plpgsql security definer set search_path=public as $$
declare w date:=date_trunc('week',current_date)::date;
begin
  delete from public.creator_rankings_weekly where week_start=w;
  insert into public.creator_rankings_weekly(week_start,channel_id,rank,score)
  select w,c.id,row_number() over(order by coalesce(sum(le.amount),0) desc,c.id),
    coalesce(sum(le.amount),0)
  from public.channels c left join public.ledger_entries le on le.account='creator_pending' and le.owner_id=c.owner_id and le.created_at>=date_trunc('week',now())
  group by c.id;
  delete from public.fan_rankings_weekly where week_start=w;
  insert into public.fan_rankings_weekly(week_start,user_id,rank,score)
  select w,owner_id,row_number() over(order by sum(-amount) desc,owner_id),sum(-amount)
  from public.ledger_entries
  where account='wallet' and amount<0 and kind not in('escrow_hold') and created_at>=date_trunc('week',now())
  group by owner_id;
end $$;

create or replace function public.record_analytics_event(_event text,_properties jsonb,_channel uuid default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare id bigint;
begin
  if length(trim(_event))<1 or length(trim(_event))>100 then raise exception 'invalid_event'; end if;
  insert into public.analytics_events(user_id,channel_id,event_name,properties)
  values(auth.uid(),_channel,trim(_event),coalesce(_properties,'{}'::jsonb))
  returning analytics_events.id into id;
  return id;
end $$;

create or replace function public.refresh_creator_analytics()
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.creator_analytics_daily(channel_id,day,views,unique_viewers,messages,sales,gross_amount,tips,live_minutes)
  select c.id,current_date,
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=current_date),0),
    coalesce((select count(distinct a.user_id) from public.analytics_events a where a.channel_id=c.id and a.event_name='post_view' and a.occurred_at>=current_date),0),
    coalesce((select count(*) from public.analytics_events a where a.channel_id=c.id and a.event_name='message_sent' and a.occurred_at>=current_date),0),
    coalesce((select count(*) from public.ledger_entries l where l.owner_id=c.owner_id and l.account='creator_pending' and l.created_at>=current_date and l.kind not in('commission','referral')),0),
    coalesce((select sum(l.amount) from public.ledger_entries l where l.owner_id=c.owner_id and l.account='creator_pending' and l.created_at>=current_date and l.kind not in('commission','referral')),0),
    coalesce((select sum(l.amount) from public.ledger_entries l where l.owner_id=c.owner_id and l.account='creator_pending' and l.kind='tip' and l.created_at>=current_date),0),
    coalesce((select sum(extract(epoch from(l.ended_at-l.started_at))/60) from public.live_sessions l where l.channel_id=c.id and l.status='ended' and l.started_at>=current_date),0)
  from public.channels c
  on conflict(channel_id,day) do update set
    views=excluded.views,unique_viewers=excluded.unique_viewers,messages=excluded.messages,
    sales=excluded.sales,gross_amount=excluded.gross_amount,tips=excluded.tips,live_minutes=excluded.live_minutes;
end $$;

create or replace function public.get_creator_goal_progress(_goal uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g public.creator_goals; earned bigint;
begin
  select * into g from public.creator_goals where id=_goal;
  if not found or not public.is_creator_of_channel(auth.uid(),g.channel_id) then raise exception 'forbidden'; end if;
  select coalesce(sum(l.amount),0) into earned from public.ledger_entries l
  where l.owner_id=(select owner_id from public.channels where id=g.channel_id)
    and l.account='creator_pending' and l.created_at>=g.starts_at and l.created_at<g.ends_at and l.kind not in('commission','referral');
  return jsonb_build_object('earned',earned,'target',g.target_amount,'progress_ratio',least(1,earned::numeric/g.target_amount::numeric));
end $$;

create or replace function public.create_referral_code(_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'creator') or trim(_code) !~ '^[a-z0-9_]{4,24}$' then raise exception 'invalid_referral_code'; end if;
  insert into public.referral_codes(id,creator_id,code) values(id,auth.uid(),lower(trim(_code)));
  return id;
end $$;

create or replace function public.redeem_referral(_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.referral_codes; id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if not coalesce((select (value#>>'{}')::boolean from public.platform_settings where key='referral.enabled'),false) then raise exception 'referral_not_configured'; end if;
  select * into r from public.referral_codes where code=lower(trim(_code)) and active;
  if not found or r.creator_id=auth.uid() or exists(select 1 from public.referrals where referred_id=auth.uid()) then raise exception 'referral_code_invalid'; end if;
  insert into public.referrals(id,referrer_id,referred_id,code,status,activated_at) values(id,r.creator_id,auth.uid(),r.code,'active',now());
  return id;
end $$;

create or replace function public.create_conversation(_channel uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare owner uuid; id uuid;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  select owner_id into owner from public.channels where id=_channel;
  if owner is null then raise exception 'channel_not_found'; end if;
  select id into id from public.conversations where client_id=auth.uid() and channel_id=_channel;
  if id is not null then return id; end if;
  insert into public.conversations(client_id,creator_id,channel_id) values(auth.uid(),owner,_channel) returning conversations.id into id;
  insert into public.conversation_members(conversation_id,user_id) values(id,auth.uid()),(id,owner);
  return id;
end $$;

create or replace function public.send_message(_conversation uuid,_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.conversations; id uuid:=gen_random_uuid(); reply text;
begin
  select * into c from public.conversations where id=_conversation;
  if not found or not exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if length(trim(_body))<1 or length(_body)>5000 then raise exception 'invalid_message'; end if;
  insert into public.messages(id,conversation_id,sender_id,kind,body) values(id,c.id,auth.uid(),'text',trim(_body));
  if auth.uid()<>c.creator_id then
    select a.reply into reply from public.auto_replies a
    where a.channel_id=c.channel_id and a.enabled and (lower(a.trigger)=lower(trim(_body)) or a.trigger='*')
    order by case when lower(a.trigger)=lower(trim(_body)) then 0 else 1 end limit 1;
    if reply is not null then insert into public.messages(conversation_id,sender_id,kind,body) values(c.id,c.creator_id,'system_auto_reply',reply); end if;
  end if;
  return id;
end $$;

create or replace function public.get_wallet_summary()
returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'wallet',coalesce((select balance from public.balances where owner_id=auth.uid() and account='wallet'),0),
 'pending',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_pending'),0),
 'available',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_available'),0)
);
$$;

create or replace function public.get_creator_dashboard()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ids uuid[];
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  select array_agg(id) into ids from public.channels where owner_id=auth.uid();
  return jsonb_build_object(
    'pending',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_pending'),0),
    'available',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_available'),0),
    'followers',coalesce((select count(*) from public.follows where channel_id=any(coalesce(ids,'{}'))),0),
    'live',coalesce((select count(*) from public.live_sessions where channel_id=any(coalesce(ids,'{}')) and status in('scheduled','live')),0),
    'goals',coalesce((select count(*) from public.creator_goals where channel_id=any(coalesce(ids,'{}')) and status='active'),0)
  );
end $$;

create or replace function public.get_media_access(_asset uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id=_asset;
  if not found then raise exception 'media_not_found'; end if;
  if not public.can_view_post(a.post_id,auth.uid()) and not public.is_creator_of_channel(auth.uid(),a.channel_id) then raise exception 'media_forbidden'; end if;
  return jsonb_build_object('path',a.storage_path,'kind',a.kind,'asset_id',a.id);
end $$;

create or replace function public.set_spend_limits(_daily bigint,_weekly bigint,_monthly bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  if _daily is not null and _daily<0 or _weekly is not null and _weekly<0 or _monthly is not null and _monthly<0 then raise exception 'invalid_limits'; end if;
  insert into public.spend_limits(user_id,daily,weekly,monthly) values(auth.uid(),_daily,_weekly,_monthly)
  on conflict(user_id) do update set daily=excluded.daily,weekly=excluded.weekly,monthly=excluded.monthly,updated_at=now();
end $$;

create or replace function public.release_due_earnings()
returns integer language plpgsql security definer set search_path=public as $$
declare e public.ledger_entries; txn uuid; moved int:=0;
begin
  for e in
    select * from public.ledger_entries x
    where x.account='creator_pending' and x.release_at is not null and x.release_at<=now()
      and not exists(select 1 from public.ledger_entries r where r.release_source_id=x.id)
    order by x.id for update
  loop
    txn:=gen_random_uuid();
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_source_id)
    values
      (txn,'creator_pending',e.owner_id,-e.amount,'release',e.ref_type,e.ref_id,e.id),
      (txn,'creator_available',e.owner_id,e.amount,'release',e.ref_type,e.ref_id,e.id);
    moved:=moved+1;
  end loop;
  return moved;
end $$;

create or replace function public.publish_scheduled_posts()
returns integer language plpgsql security definer set search_path=public as $$
declare n int;
begin
  update public.posts set status='published' where status='scheduled' and publish_at is not null and publish_at<=now();
  get diagnostics n=row_count;
  return n;
end $$;

create or replace function public.open_due_lives()
returns integer language plpgsql security definer set search_path=public as $$
declare n int;
begin
  update public.live_sessions set status='live' where status='scheduled' and scheduled_at is not null and scheduled_at<=now();
  get diagnostics n=row_count; return n;
end $$;

create or replace function public.close_due_auctions()
returns integer language plpgsql security definer set search_path=public as $$
declare a public.auctions; n int:=0;
begin
  for a in select * from public.auctions where status in('scheduled','live') and ends_at<=now() loop
    begin perform public.close_auction(a.id); n:=n+1; exception when others then null; end;
  end loop;
  return n;
end $$;

create or replace function public.reconcile_ledger()
returns bigint language sql stable security definer set search_path=public as $$
with s as(select owner_id,account,sum(amount) total from public.ledger_entries group by owner_id,account)
select count(*) from(
 select coalesce(s.owner_id,b.owner_id) owner_id,coalesce(s.account,b.account) account,coalesce(s.total,0) a,coalesce(b.balance,0) b
 from s full join public.balances b using(owner_id,account)
 where coalesce(s.total,0)<>coalesce(b.balance,0)
)t;
$$;

revoke all on function public.protect_profile_security_fields() from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.ledger_apply() from public,anon,authenticated;
revoke all on function public.ledger_immutable() from public,anon,authenticated;
revoke all on function public.assert_ledger_txn_balanced() from public,anon,authenticated;
revoke all on function public.has_role(uuid,public.app_role) from public,anon;
revoke all on function public.is_age_verified(uuid) from public,anon,authenticated;
revoke all on function public.is_creator_of_channel(uuid,uuid) from public,anon,authenticated;
revoke all on function public.has_active_subscription(uuid,uuid) from public,anon,authenticated;
revoke all on function public.has_tier_rank(uuid,uuid,smallint) from public,anon,authenticated;
revoke all on function public.commission_rate(uuid,text) from public,anon,authenticated;
revoke all on function public.assert_spend_limit(uuid,bigint) from public,anon,authenticated;
revoke all on function public.referral_reward(uuid,bigint) from public,anon,authenticated;
revoke all on function public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public._hold_escrow(uuid,uuid,bigint,text,uuid,text) from public,anon,authenticated;
revoke all on function public._release_escrow(uuid,text) from public,anon,authenticated;
revoke all on function public._refund_escrow(uuid) from public,anon,authenticated;
revoke all on function public.award_configured_points(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.release_due_earnings() from public,anon,authenticated;
revoke all on function public.publish_scheduled_posts() from public,anon,authenticated;
revoke all on function public.open_due_lives() from public,anon,authenticated;
revoke all on function public.close_due_auctions() from public,anon,authenticated;
revoke all on function public.reconcile_ledger() from public,anon,authenticated;

grant execute on function public.approve_kyc(uuid,boolean,text) to authenticated;
grant execute on function public.get_kyc_status() to authenticated;
grant execute on function public.spend_on_channel(uuid,bigint,text,text,uuid,text) to authenticated;
grant execute on function public.send_tip(uuid,bigint,text,text) to authenticated;
grant execute on function public.send_gift(uuid,uuid,integer,text,text) to authenticated;
grant execute on function public.create_custom_request(uuid,text,bigint,text) to authenticated;
grant execute on function public.update_custom_request(uuid,text) to authenticated;
grant execute on function public.release_custom_request(uuid) to authenticated;
grant execute on function public.create_auction(uuid,text,text,bigint,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.place_bid(uuid,bigint,text) to authenticated;
grant execute on function public.close_auction(uuid) to authenticated;
grant execute on function public.create_bundle(uuid,text,text,bigint,uuid[]) to authenticated;
grant execute on function public.buy_bundle(uuid,text) to authenticated;
grant execute on function public.create_order(jsonb,jsonb,text) to authenticated;
grant execute on function public.update_order(uuid,text) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.create_live_session(uuid,text,text,text,bigint,timestamptz) to authenticated;
grant execute on function public.buy_live_ticket(uuid,text) to authenticated;
grant execute on function public.update_call_rates(uuid,bigint,bigint) to authenticated;
grant execute on function public.create_call_session(uuid,text) to authenticated;
grant execute on function public.issue_live_access(uuid) to authenticated;
grant execute on function public.enter_giveaway(uuid) to authenticated;
grant execute on function public.create_giveaway(uuid,text,text,timestamptz,timestamptz,smallint,boolean) to authenticated;
grant execute on function public.draw_giveaway(uuid) to authenticated;
grant execute on function public.create_poll(uuid,text,timestamptz,text[]) to authenticated;
grant execute on function public.cast_poll_vote(uuid,uuid) to authenticated;
grant execute on function public.record_login() to authenticated;
grant execute on function public.get_loyalty_status() to authenticated;
grant execute on function public.get_creator_goal_progress(uuid) to authenticated;
grant execute on function public.create_referral_code(text) to authenticated;
grant execute on function public.redeem_referral(text) to authenticated;
grant execute on function public.create_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid,text) to authenticated;
grant execute on function public.get_wallet_summary() to authenticated;
grant execute on function public.get_creator_dashboard() to authenticated;
grant execute on function public.get_media_access(uuid) to authenticated;
grant execute on function public.record_analytics_event(text,jsonb,uuid) to authenticated;
grant execute on function public.set_spend_limits(bigint,bigint,bigint) to authenticated;

select cron.schedule('prively-publish-posts','* * * * *','select public.publish_scheduled_posts();');
select cron.schedule('prively-release-earnings','*/15 * * * *','select public.release_due_earnings();');
select cron.schedule('prively-bill-calls','* * * * *','select public.bill_active_calls();');
select cron.schedule('prively-close-auctions','* * * * *','select public.close_due_auctions();');
select cron.schedule('prively-open-lives','* * * * *','select public.open_due_lives();');
select cron.schedule('prively-refresh-rankings','15 0 * * *','select public.refresh_rankings();');
select cron.schedule('prively-award-badges','30 0 * * *','select public.award_badges();');
select cron.schedule('prively-refresh-analytics','45 0 * * *','select public.refresh_creator_analytics();');
select cron.schedule('prively-reconcile-ledger','55 0 * * *','select public.reconcile_ledger();');
