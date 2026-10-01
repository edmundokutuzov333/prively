begin;

select plan(28);

select ok(
  to_regprocedure('public.spend_on_channel(uuid,bigint,text,text,uuid,text)') is not null,
  'public spend_on_channel contract exists'
);

select ok(
  to_regprocedure('public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)') is not null,
  'internal spend engine exists'
);

select ok(
  to_regprocedure('public.commission_rate(uuid,text)') is not null
  and to_regprocedure('public.release_due_earnings()') is not null,
  'commission and release contracts exist'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.spend_on_channel(uuid,bigint,text,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)',
    'EXECUTE'
  ),
  'public entrypoint exposed, internal engine protected'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.commission_rate(uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.release_due_earnings()',
    'EXECUTE'
  ),
  'financial helper functions are not client-writable contracts'
);

select ok(
  exists(
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='ledger_entries'
      and indexname='ledger_entries_release_source_unique_idx'
  ),
  'release source has a uniqueness guard'
);

select ok(
  exists(
    select 1
    from cron.job
    where jobname='prively-release-earnings'
      and schedule='*/15 * * * *'
      and active
  ),
  'release job is active every 15 minutes'
);

create temporary table _phase6_meta(
  key text primary key,
  value text not null
) on commit drop;

do $$
declare
  buyer uuid := '96060000-0000-0000-0000-000000000001';
  creator uuid := '96060000-0000-0000-0000-000000000002';
  channel uuid := '96060000-0000-0000-0000-000000000010';
  ref_id uuid := '96060000-0000-0000-0000-000000000020';
  txn_one uuid;
  txn_two uuid;
  release_count integer;
  caught text;
  creator_pending_before bigint;
  platform_before bigint;
  wallet_before bigint;
  seed_txn uuid := gen_random_uuid();
begin
  perform set_config('app.internal_write','on',true);

  insert into auth.users(
    id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at
  )
  values
    (
      buyer,'authenticated','authenticated',
      'phase6-spend-buyer@example.test','test',
      '{"handle":"phase6_spend_buyer"}'::jsonb,now()
    ),
    (
      creator,'authenticated','authenticated',
      'phase6-spend-creator@example.test','test',
      '{"handle":"phase6_spend_creator"}'::jsonb,now()
    )
  on conflict(id) do nothing;

  update public.profiles
  set status='active', age_verified_at=now()
  where id in (buyer,creator);

  insert into public.kyc_verifications(user_id,provider,status,reviewed_at)
  values
    (buyer,'manual','approved',now()),
    (creator,'manual','approved',now())
  on conflict do nothing;

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.channels(
    id,owner_id,handle,display_name,is_seed
  )
  values(
    channel,creator,'phase6_spend_creator',
    'Phase 6 Spend Creator',true
  )
  on conflict(id) do nothing;

  insert into public.ledger_entries(
    txn_id,account,owner_id,amount,kind,ref_type,ref_id
  )
  values
    (
      seed_txn,'wallet',buyer,100000,'test_seed','test',gen_random_uuid()
    ),
    (
      seed_txn,'external','00000000-0000-0000-0000-000000000000'::uuid,
      -100000,'test_seed','test',gen_random_uuid()
    );

  insert into public.balances(owner_id,account,balance)
  values
    (creator,'creator_pending',0),
    (creator,'creator_available',0)
  on conflict(owner_id,account) do update set balance=excluded.balance;

  update public.platform_settings
  set value='0.30'::jsonb
  where key='commission.default';

  update public.platform_settings
  set value='{}'::jsonb
  where key='commission.by_kind';

  update public.platform_settings
  set value='72'::jsonb
  where key='hold_hours';

  update public.platform_settings
  set value='false'::jsonb
  where key='referral.enabled';

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',buyer::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal2',
      'session_id',gen_random_uuid()::text
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role authenticated;

  txn_one := public.spend_on_channel(
    channel,
    10000,
    'phase6_test',
    'post',
    ref_id,
    'phase6-idem-001'
  );

  txn_two := public.spend_on_channel(
    channel,
    10000,
    'phase6_test',
    'post',
    ref_id,
    'phase6-idem-001'
  );

  insert into _phase6_meta(key,value)
  values
    ('txn_one',txn_one::text),
    ('txn_two',txn_two::text)
  on conflict(key) do update set value=excluded.value;

  select balance into wallet_before
  from public.balances
  where owner_id=buyer and account='wallet';

  select balance into creator_pending_before
  from public.balances
  where owner_id=creator and account='creator_pending';

  select balance into platform_before
  from public.balances
  where owner_id='00000000-0000-0000-0000-000000000000'::uuid
    and account='platform_revenue';

  insert into _phase6_meta(key,value)
  values
    ('wallet_after',wallet_before::text),
    ('creator_pending_after',creator_pending_before::text),
    ('platform_after',coalesce(platform_before,0)::text)
  on conflict(key) do update set value=excluded.value;

  begin
    perform public.spend_on_channel(
      channel,
      9999999,
      'phase6_insufficient',
      'post',
      gen_random_uuid(),
      'phase6-idem-insufficient'
    );
    raise exception 'expected_insufficient_funds_not_raised';
  exception when others then
    caught := sqlerrm;
    insert into _phase6_meta(key,value)
    values('insufficient_error',caught)
    on conflict(key) do update set value=excluded.value;
  end;

  set local role postgres;

  update public.ledger_entries
  set release_at=now()-interval '1 minute'
  where txn_id=txn_one
    and account='creator_pending';

  set local role service_role;

  release_count := public.release_due_earnings();

  insert into _phase6_meta(key,value)
  values('release_count',release_count::text)
  on conflict(key) do update set value=excluded.value;

  perform public.release_due_earnings();

  set local role postgres;

  insert into _phase6_meta(key,value)
  select
    'release_rows',
    count(*)::text
  from public.ledger_entries
  where release_source_id in (
    select id from public.ledger_entries where txn_id=txn_one and account='creator_pending'
  );

  update public.platform_settings
  set value='0.20'::jsonb
  where key='commission.default';

  update public.platform_settings
  set value='{"tip":0.10,"meeting":0}'::jsonb
  where key='commission.by_kind';
end $$;

select is(
  (select value from _phase6_meta where key='txn_one'),
  (select value from _phase6_meta where key='txn_two'),
  'same idempotency key returns the same transaction'
);

select is(
  (select count(*)::bigint
   from public.ledger_entries
   where txn_id=(select value::uuid from _phase6_meta where key='txn_one')),
  3::bigint,
  'one spend creates exactly three primary ledger postings'
);

select is(
  (select sum(amount)::bigint
   from public.ledger_entries
   where txn_id=(select value::uuid from _phase6_meta where key='txn_one')),
  0::bigint,
  'spend transaction is balanced'
);

select is(
  (select value::bigint from _phase6_meta where key='wallet_after'),
  90000::bigint,
  'wallet is debited exactly once'
);

select is(
  (select value::bigint from _phase6_meta where key='creator_pending_after'),
  7000::bigint,
  'creator receives 70 percent to pending when commission is 30 percent'
);

select is(
  (select value::bigint from _phase6_meta where key='platform_after'),
  3000::bigint,
  'platform receives the configured commission'
);

select is(
  (select value from _phase6_meta where key='insufficient_error'),
  'insufficient_funds',
  'insufficient funds fail with the expected domain error'
);

select is(
  (select count(*)::bigint
   from public.ledger_entries
   where owner_id='96060000-0000-0000-0000-000000000001'::uuid
     and kind='phase6_insufficient'),
  0::bigint,
  'insufficient funds create no debit'
);

select is(
  (select count(*)::bigint
   from public.idempotency_keys
   where owner_id='96060000-0000-0000-0000-000000000001'::uuid
     and key='phase6-idem-insufficient'),
  0::bigint,
  'failed spend does not reserve the idempotency key'
);

select ok(
  (select release_at
   from public.ledger_entries
   where txn_id=(select value::uuid from _phase6_meta where key='txn_one')
     and account='creator_pending') <= now(),
  'pending earnings were forced into the due state'
);

select is(
  (select value from _phase6_meta where key='release_count'),
  '1',
  'release_due_earnings moves one due source entry'
);

select is(
  (select count(*)::bigint
   from public.ledger_entries
   where release_source_id in (
     select id
     from public.ledger_entries
     where txn_id=(select value::uuid from _phase6_meta where key='txn_one')
       and account='creator_pending'
   )),
  2::bigint,
  'one release source creates paired pending and available entries'
);

select is(
  (select balance
   from public.balances
   where owner_id='96060000-0000-0000-0000-000000000002'::uuid
     and account='creator_pending'),
  0::bigint,
  'released pending balance is cleared'
);

select is(
  (select balance
   from public.balances
   where owner_id='96060000-0000-0000-0000-000000000002'::uuid
     and account='creator_available'),
  7000::bigint,
  'released earnings become available'
);

select is(
  public.commission_rate(null,'phase6_test'),
  0.20::numeric,
  'commission helper reads the current production setting after test override is restored'
);

select is(
  public.commission_rate(null,'tip'),
  0.10::numeric,
  'commission helper reads per-kind configuration'
);

select is(
  public.commission_rate(null,'meeting'),
  0::numeric,
  'commission helper preserves zero-commission kinds'
);

select is(
  public.reconcile_ledger(),
  0::bigint,
  'ledger remains reconciled after the spend and release flow'
);

select ok(
  not exists(
    select 1
    from public.balances
    where account='wallet' and balance < 0
  ),
  'wallet balances remain non-negative'
);

select ok(
  exists(
    select 1
    from public.ledger_entries
    where txn_id=(select value::uuid from _phase6_meta where key='txn_one')
      and release_at >= now()+interval '71 hours'
  ),
  'spend uses the configured 72-hour hold'
);

select ok(
  not exists(
    select 1
    from public.ledger_entries x
    where x.account='creator_pending'
      and x.release_source_id is null
      and x.release_at <= now()
      and x.amount <= 0
  ),
  'release candidates only contain positive pending earnings'
);

select * from finish();
rollback;
