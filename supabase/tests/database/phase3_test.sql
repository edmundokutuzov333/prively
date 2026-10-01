begin;

select plan(17);

select ok(to_regclass('public.profiles') is not null,'profiles exists');
select ok(to_regclass('public.ledger_entries') is not null,'ledger exists');
select ok(to_regclass('public.live_sessions') is not null,'live sessions exist');
select ok(to_regclass('public.custom_requests') is not null,'custom requests exist');
select ok(to_regclass('public.auctions') is not null,'auctions exist');
select ok(to_regclass('public.products') is not null,'products exist');
select ok(to_regclass('public.loyalty_points') is not null,'loyalty table exists');

select ok((select relrowsecurity from pg_class where oid='public.ledger_entries'::regclass),'ledger RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.custom_requests'::regclass),'escrow domain RLS enabled');
select ok((select count(*) from pg_policies where schemaname='public' and tablename='ledger_entries')>0,'ledger has RLS policy');
select ok(to_regprocedure('public.spend_on_channel(uuid,bigint,text,text,uuid,text)') is not null,'spend RPC exists');
select ok(to_regprocedure('public.issue_live_access(uuid)') is not null,'live access RPC exists');
select ok(to_regprocedure('public.release_due_earnings()') is not null,'release job exists');

do $$
declare
  buyer uuid:='10000000-0000-0000-0000-000000000001';
  creator uuid:='10000000-0000-0000-0000-000000000002';
  channel uuid:=gen_random_uuid();
  txn uuid;
  seed_txn_a uuid;
  seed_txn_b uuid;
  escrow uuid;
  buyer_wallet bigint;
  creator_pending bigint;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values
    (buyer,'authenticated','authenticated','buyer@example.test','test','{"handle":"buyer_test"}'::jsonb),
    (creator,'authenticated','authenticated','creator@example.test','test','{"handle":"creator_test"}'::jsonb);

  perform set_config('app.internal_write','on',true);
  update public.profiles set status='active' where id in (buyer,creator);
  insert into public.kyc_verifications(user_id,provider,status,provider_ref)
  values
    (buyer,'manual','pending','phase3:'||buyer::text),
    (creator,'manual','pending','phase3:'||creator::text);
  insert into public.user_roles(user_id,role) values (creator,'creator'),(creator,'compliance'),(creator,'admin') on conflict do nothing;
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2')::text,true);
  set local role service_role;
  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
  perform public.approve_kyc(
    (select id from public.kyc_verifications where user_id=buyer limit 1),
    true,
    'phase3-buyer-approved',
    creator
  );
  perform public.approve_kyc(
    (select id from public.kyc_verifications where user_id=creator limit 1),
    true,
    'phase3-creator-approved',
    creator
  );
  set local role postgres;
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text)::text,true);
  insert into public.channels(id,owner_id,handle,display_name,call_audio_price,call_video_price)
  values(channel,creator,'creator_test','Creator Test',1000,1500);

  set local role service_role;
  update public.platform_settings set value='true'::jsonb where key='wallet.production_enabled';

  seed_txn_a:=gen_random_uuid();
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (seed_txn_a,'wallet',buyer,500000,'phase3_seed','topup',null),
    (seed_txn_a,'external','00000000-0000-0000-0000-000000000000'::uuid,-500000,'phase3_seed','topup',null);

  seed_txn_b:=gen_random_uuid();
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (seed_txn_b,'wallet',buyer,500000,'phase3_seed','topup',null),
    (seed_txn_b,'external','00000000-0000-0000-0000-000000000000'::uuid,-500000,'phase3_seed','topup',null);

  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object(
    'sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2',
    'session_id',gen_random_uuid()::text
  )::text,true);

  txn:=public._spend_on_channel(buyer,channel,100000,'tip','tip',gen_random_uuid(),'test-tip');
  if not exists(select 1 from public.ledger_entries where txn_id=txn group by txn_id having sum(amount)=0) then
    raise exception 'spend transaction not balanced';
  end if;

  escrow:=public._hold_escrow(buyer,creator,200000,'custom_request',gen_random_uuid(),'test-escrow');
  perform public._release_escrow(escrow,'custom_request');

  select balance into buyer_wallet from public.balances where owner_id=buyer and account='wallet';
  select balance into creator_pending from public.balances where owner_id=creator and account='creator_pending';

  if buyer_wallet<>700000 then raise exception 'unexpected buyer wallet %',buyer_wallet; end if;
  if creator_pending<>250000 then raise exception 'unexpected creator pending %',creator_pending; end if;
  if not exists(select 1 from public.escrow_records where id=escrow and status='released') then raise exception 'escrow not released'; end if;
end $$;

select is((select balance from public.balances where owner_id='10000000-0000-0000-0000-000000000001'::uuid and account='wallet'),700000::bigint,'ledger wallet balance is exact');
select is((select balance from public.balances where owner_id='10000000-0000-0000-0000-000000000002'::uuid and account='creator_pending'),250000::bigint,'creator pending balance is exact');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);

select is((select count(*) from public.ledger_entries where owner_id='10000000-0000-0000-0000-000000000001'::uuid),4::bigint,'buyer sees only own ledger rows through RLS');
select is((select count(*) from public.ledger_entries where owner_id='10000000-0000-0000-0000-000000000002'::uuid),0::bigint,'buyer cannot read creator ledger rows');

reset role;
select * from finish();
rollback;
