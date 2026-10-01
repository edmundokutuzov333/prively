begin;

select no_plan();

select ok(
  (select relrowsecurity from pg_class where oid='public.subscription_tiers'::regclass)
  and (select relrowsecurity from pg_class where oid='public.subscriptions'::regclass),
  'subscription tables use RLS'
);

select ok(
  has_table_privilege('anon','public.subscription_tiers','SELECT')
  and has_table_privilege('authenticated','public.subscription_tiers','SELECT')
  and has_table_privilege('authenticated','public.subscriptions','SELECT')
  and not has_table_privilege('authenticated','public.subscription_tiers','INSERT')
  and not has_table_privilege('authenticated','public.subscription_tiers','UPDATE')
  and not has_table_privilege('authenticated','public.subscription_tiers','DELETE')
  and not has_table_privilege('authenticated','public.subscriptions','INSERT')
  and not has_table_privilege('authenticated','public.subscriptions','UPDATE')
  and not has_table_privilege('authenticated','public.subscriptions','DELETE'),
  'subscription tables expose read-only direct access to clients'
);

select ok(
  has_function_privilege('authenticated','public.upsert_subscription_tier(uuid,text,smallint,bigint,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.subscribe_to_tier(uuid,smallint,text)','EXECUTE')
  and has_function_privilege('authenticated','public.cancel_subscription(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.renew_due_subscriptions()','EXECUTE'),
  'client subscription entrypoints have the intended grants'
);

select ok(
  has_function_privilege('service_role','public.renew_due_subscriptions()','EXECUTE')
  and not has_function_privilege('authenticated','public.has_active_subscription(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.has_tier_rank(uuid,uuid,smallint)','EXECUTE'),
  'renewal and visibility helpers are trusted-only'
);

select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='subscription_tiers' and policyname='tiers_read' and cmd='SELECT')
  and exists(select 1 from pg_policies where schemaname='public' and tablename='subscriptions' and policyname='subscriptions_parties' and cmd='SELECT'),
  'subscription RLS read policies exist'
);

select ok(
  exists(select 1 from cron.job where jobname='prively-renew-subscriptions' and active and schedule='0 3 * * *'),
  'daily subscription renewal job is active'
);

select ok(
  exists(
    select 1 from pg_proc
    where pronamespace='public'::regnamespace
      and proname='has_active_subscription'
      and pg_get_functiondef(oid) like '%status = ''past_due''%'
      and pg_get_functiondef(oid) like '%interval ''3 days''%'
  ),
  'past_due subscriptions retain access for three days'
);

select ok(
  exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='can_view_post' and pg_get_functiondef(oid) like '%when ''subscribers''%')
  and exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='can_view_post' and pg_get_functiondef(oid) like '%when ''tier''%'),
  'can_view_post contains subscriber and tier visibility contracts'
);

do $$
declare
  creator uuid := '99060000-0000-0000-0000-000000000001';
  buyer uuid := '99060000-0000-0000-0000-000000000002';
  buyer_two uuid := '99060000-0000-0000-0000-000000000003';
  channel uuid := '99060000-0000-0000-0000-000000000010';
  bronze uuid;
  ouro uuid;
  post_subscribers uuid := '99060000-0000-0000-0000-000000000020';
  post_tier uuid := '99060000-0000-0000-0000-000000000021';
  sub_id uuid;
  seed_txn_buyer uuid;
  seed_txn_buyer_two uuid;
  b0 bigint;
  b1 bigint;
  b3 bigint;
  b6 bigint;
  b12 bigint;
  renewal_end timestamptz;
  past_due_id uuid;
  expired_id uuid;
begin
  perform set_config('app.internal_write','on',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at)
  values
    (creator,'authenticated','authenticated','phase9-sub-creator@example.test','test','{"handle":"phase9_sub_creator"}'::jsonb,now()),
    (buyer,'authenticated','authenticated','phase9-sub-buyer@example.test','test','{"handle":"phase9_sub_buyer"}'::jsonb,now()),
    (buyer_two,'authenticated','authenticated','phase9-sub-buyer-two@example.test','test','{"handle":"phase9_sub_buyer_two"}'::jsonb,now())
  on conflict(id) do nothing;

  update public.profiles
  set status='active', age_verified_at=now()
  where id in (creator,buyer,buyer_two);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.creator_terms_acceptances(user_id,version,source,declarations)
  values(creator,'1.0.0','phase9-test','{"identity":true,"consent":true,"rights":true}'::jsonb)
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,reviewed_at)
  values
    (creator,'manual','approved',now()),
    (buyer,'manual','approved',now()),
    (buyer_two,'manual','approved',now())
  on conflict do nothing;

  insert into public.channels(id,owner_id,handle,display_name,is_seed)
  values(channel,creator,'phase9_sub_creator','Phase 9 Subscription Creator',false)
  on conflict(id) do nothing;

  set local role service_role;

  seed_txn_buyer:=gen_random_uuid();
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (seed_txn_buyer,'wallet',buyer,500000,'phase9_seed','topup',null),
    (seed_txn_buyer,'external','00000000-0000-0000-0000-000000000000'::uuid,-500000,'phase9_seed','topup',null);

  seed_txn_buyer_two:=gen_random_uuid();
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  values
    (seed_txn_buyer_two,'wallet',buyer_two,500000,'phase9_seed','topup',null),
    (seed_txn_buyer_two,'external','00000000-0000-0000-0000-000000000000'::uuid,-500000,'phase9_seed','topup',null);

  perform set_config('request.jwt.claims',
    json_build_object('sub',creator::text,'role','authenticated','aud','authenticated','aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub',creator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role authenticated;

  bronze := public.upsert_subscription_tier(
    channel,'Bronze'::text,1::smallint,10000::bigint,'{"1":0,"3":0.15,"6":0.25,"12":0.40}'::jsonb
  );

  ouro := public.upsert_subscription_tier(
    channel,'Ouro'::text,3::smallint,20000::bigint,'{"1":0,"3":0.15,"6":0.25,"12":0.40}'::jsonb
  );

  set local role postgres;

  select balance into b0 from public.balances where owner_id=buyer and account='wallet';

  perform set_config('request.jwt.claims',
    json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role authenticated;

  sub_id := public.subscribe_to_tier(bronze,1::smallint,'phase9-sub-1');
  select balance into b1 from public.balances where owner_id=buyer and account='wallet';

  sub_id := public.subscribe_to_tier(bronze,3::smallint,'phase9-sub-3');
  select balance into b3 from public.balances where owner_id=buyer and account='wallet';

  perform public.subscribe_to_tier(bronze,6::smallint,'phase9-sub-6');
  select balance into b6 from public.balances where owner_id=buyer and account='wallet';

  perform public.subscribe_to_tier(bronze,12::smallint,'phase9-sub-12');
  select balance into b12 from public.balances where owner_id=buyer and account='wallet';

  if b0-b1 <> 10000 then raise exception 'one_month_price_failed'; end if;
  if b1-b3 <> 25500 then raise exception 'three_month_discount_failed'; end if;
  if b3-b6 <> 45000 then raise exception 'six_month_discount_failed'; end if;
  if b6-b12 <> 72000 then raise exception 'twelve_month_discount_failed'; end if;

  set local role postgres;

  insert into public.posts(id,channel_id,caption,visibility,status,min_tier_rank)
  values
    (post_subscribers,channel,'Subscriber post','subscribers','published',null),
    (post_tier,channel,'Tier post','tier','published',2);

  perform set_config('request.jwt.claims',
    json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role service_role;
  if not public.can_view_post(post_subscribers) then raise exception 'subscriber_visibility_failed'; end if;
  if public.can_view_post(post_tier) then raise exception 'tier_visibility_should_fail_for_rank_one'; end if;

  set local role postgres;
  update public.subscriptions set tier_id=ouro where id=sub_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2')::text,true);
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role service_role;
  if not public.can_view_post(post_tier) then raise exception 'tier_visibility_failed_after_upgrade'; end if;

  set local role postgres;
  update public.subscriptions
  set current_period_end=now()-interval '1 hour',auto_renew=true,status='active',past_due_at=null
  where id=sub_id;

  set local role service_role;
  perform public.renew_due_subscriptions();

  set local role postgres;
  select current_period_end into renewal_end from public.subscriptions where id=sub_id;
  if renewal_end <= now() then raise exception 'renewal_did_not_extend'; end if;

  insert into public.subscriptions(
    id,subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,auto_renew,status,past_due_at
  )
  values(
    '99060000-0000-0000-0000-000000000030',buyer_two,channel,bronze,1,10000,now()-interval '4 days',true,'past_due',now()-interval '4 days'
  );

  perform public.renew_due_subscriptions();

  if exists(select 1 from public.subscriptions where id='99060000-0000-0000-0000-000000000030'::uuid and status<>'expired') then
    raise exception 'past_due_grace_not_expired';
  end if;

  update public.subscriptions
  set current_period_end=now()-interval '1 hour',
      auto_renew=false,
      status='active',
      past_due_at=null
  where id='99060000-0000-0000-0000-000000000030'::uuid;

  perform public.renew_due_subscriptions();

  if exists(select 1 from public.subscriptions where id='99060000-0000-0000-0000-000000000030'::uuid and status<>'expired') then
    raise exception 'non_renewing_subscription_did_not_expire';
  end if;

  set local role postgres;
end $$;

select ok(
  to_regprocedure('public.upsert_subscription_tier(uuid,text,smallint,bigint,jsonb)') is not null,
  'creator tier management RPC exists'
);

select is(
  (select count(*)::bigint from public.subscription_tiers where channel_id='99060000-0000-0000-0000-000000000010'::uuid),
  2::bigint,
  'two tiers created through owner RPC'
);

select ok(
  (select count(*) from public.ledger_entries where owner_id='99060000-0000-0000-0000-000000000002'::uuid and kind='subscription') = 5
  and (select count(*) from public.ledger_entries where owner_id='99060000-0000-0000-0000-000000000002'::uuid and kind='subscription' and amount < 0) = 5,
  'four purchases plus one renewal created subscription ledger debits'
);

select ok(
  exists(
    select 1 from public.ledger_entries
    where owner_id='99060000-0000-0000-0000-000000000002'::uuid
      and kind='subscription'
      and ref_type='tier'
      and amount < 0
  ),
  'subscription purchase uses the subscription spend ledger contract'
);

select ok(public.reconcile_ledger() = 0,'ledger remains reconciled');

select * from finish();
rollback;
