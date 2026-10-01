begin;

select plan(17);

select ok(
  to_regclass('public.topups') is not null
  and to_regclass('public.payment_webhook_events') is not null,
  'topup runtime tables exist'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.topups'::regclass)
  and (select relrowsecurity from pg_class where oid='public.payment_webhook_events'::regclass),
  'topup tables use RLS'
);

select ok(
  not has_table_privilege('anon','public.topups','INSERT')
  and not has_table_privilege('authenticated','public.topups','INSERT')
  and not has_table_privilege('authenticated','public.topups','UPDATE')
  and not has_table_privilege('authenticated','public.topups','DELETE'),
  'clients cannot mutate topups directly'
);

select ok(
  not has_table_privilege('anon','public.payment_webhook_events','INSERT')
  and not has_table_privilege('authenticated','public.payment_webhook_events','INSERT')
  and not has_table_privilege('authenticated','public.payment_webhook_events','UPDATE')
  and not has_table_privilege('authenticated','public.payment_webhook_events','DELETE'),
  'clients cannot mutate webhook events directly'
);

select ok(
  not has_table_privilege('anon','public.idempotency_keys','INSERT')
  and not has_table_privilege('authenticated','public.idempotency_keys','INSERT'),
  'clients cannot mutate idempotency records directly'
);

select ok(
  has_function_privilege('authenticated','public.create_topup_intent(bigint,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE')
  and has_function_privilege('service_role','public.credit_topup(text,text,bigint,text)','EXECUTE')
  and has_function_privilege('service_role','public.expire_pending_topups()','EXECUTE'),
  'topup RPC grants expose creation only to authenticated clients'
);

select ok(
  exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='topups'
  ),
  'topups are published to Realtime'
);

select ok(
  to_regprocedure('public.get_financial_settings()') is not null,
  'financial settings RPC exists'
);

create temporary table _phase5_meta(
  key text primary key,
  value text not null
) on commit drop;

do $$
declare
  buyer uuid := '95050000-0000-0000-0000-000000000001';
  first_intent jsonb;
  duplicate_intent jsonb;
  topup_id uuid;
  expired_id uuid;
  caught text;
begin
  set local role postgres;
  perform set_config('app.internal_write','on',true);
  update public.platform_settings
  set value='true'::jsonb
  where key='wallet.production_enabled';

  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
  values(
    buyer,
    'authenticated',
    'authenticated',
    'phase5-topup@example.test',
    'test',
    '{"handle":"phase5_topup_test"}'::jsonb
  )
  on conflict(id) do nothing;

  update public.profiles
  set status='active', age_verified_at=now()
  where id=buyer;

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

  set local role authenticated;

  first_intent := public.create_topup_intent(10000,'mpesa','phase5-topup-idem');
  duplicate_intent := public.create_topup_intent(10000,'mpesa','phase5-topup-idem');

  if (public.get_financial_settings()->>'wallet_topup_enabled') is null
     or (public.get_financial_settings()->>'wallet_min_topup_centavos') is null
     or (public.get_financial_settings()->>'wallet_max_topup_centavos') is null
     or (public.get_financial_settings()->>'wallet_daily_topup_limit_centavos') is null then
    raise exception 'financial_settings_topup_contract_missing';
  end if;

  insert into _phase5_meta(key,value)
  values
    ('first_id',first_intent->>'id'),
    ('duplicate_id',duplicate_intent->>'id')
  on conflict(key) do update set value=excluded.value;

  begin
    perform public.create_topup_intent(9999,'mpesa','phase5-topup-below-min');
    raise exception 'expected_topup_below_minimum_not_raised';
  exception when others then
    caught := sqlerrm;
    if caught <> 'topup_below_minimum' then
      raise exception 'unexpected_minimum_error:%',caught;
    end if;
  end;

  begin
    perform public.create_topup_intent(500001,'mpesa','phase5-topup-over-max');
    raise exception 'expected_topup_limit_not_raised';
  exception when others then
    caught := sqlerrm;
    if caught <> 'topup_limit_exceeded' then
      raise exception 'unexpected_max_error:%',caught;
    end if;
  end;

  set local role postgres;

  topup_id := (first_intent->>'id')::uuid;
  update public.topups
  set provider_ref='phase5-provider-ref',
      expires_at=now()+interval '15 minutes'
  where id=topup_id;

  set local role service_role;

  perform public.credit_topup(
    'phase5-provider-ref',
    'paid',
    10000,
    'phase5-provider-tx'
  );

  perform public.credit_topup(
    'phase5-provider-ref',
    'paid',
    10000,
    'phase5-provider-tx-duplicate'
  );

  begin
    perform public.credit_topup(
      'phase5-provider-ref',
      'paid',
      9999,
      'phase5-provider-tx-mismatch'
    );
    raise exception 'expected_amount_mismatch_not_raised';
  exception when others then
    caught := sqlerrm;
    if caught <> 'amount_mismatch' then
      raise exception 'unexpected_amount_mismatch_error:%',caught;
    end if;
  end;

  set local role postgres;

  insert into public.topups(
    user_id,provider,method,amount,currency,internal_reference,provider_ref,idempotency_key,expires_at
  ) values(
    '95050000-0000-0000-0000-000000000001'::uuid,
    'paysuite','mpesa',10000,'MZN',
    'PRV-TU-PHASE5-EXPIRED',
    'phase5-provider-ref-expired',
    'phase5-expired-idem',
    now()-interval '1 minute'
  )
  returning id into expired_id;

  set local role service_role;

  perform public.expire_pending_topups();

  begin
    perform public.credit_topup(
      'phase5-provider-ref-expired',
      'paid',
      10000,
      'phase5-expired-paid'
    );
    raise exception 'expected_topup_not_payable_not_raised';
  exception when others then
    caught := sqlerrm;
    if caught <> 'topup_not_payable' then
      raise exception 'unexpected_terminal_state_error:%',caught;
    end if;
  end;

  insert into _phase5_meta(key,value)
  values('expired_status',(select status from public.topups where id=expired_id))
  on conflict(key) do update set value=excluded.value;
end $$;

select is(
  (select value from _phase5_meta where key='first_id'),
  (select value from _phase5_meta where key='duplicate_id'),
  'same idempotency key returns the same topup'
);

select is(
  (select count(*)::bigint from public.topups where idempotency_key='phase5-topup-idem'),
  1::bigint,
  'same idempotency key creates one topup row'
);

select is(
  (select status from public.topups where provider_ref='phase5-provider-ref'),
  'paid',
  'paid webhook state is persisted'
);

select is(
  (select count(*)::bigint
   from public.ledger_entries
   where ref_type='topup'
     and ref_id=(select id from public.topups where provider_ref='phase5-provider-ref')
     and account='wallet'
     and amount=10000),
  1::bigint,
  'duplicate paid webhook credits wallet once'
);

select ok(
  (select count(*) from public.ledger_entries where ref_type='topup' and ref_id=(select id from public.topups where provider_ref='phase5-provider-ref'))=2
  and (select sum(amount) from public.ledger_entries where ref_type='topup' and ref_id=(select id from public.topups where provider_ref='phase5-provider-ref'))=0,
  'topup credit creates a balanced double-entry transaction'
);

select is(
  (select value from _phase5_meta where key='expired_status'),
  'expired',
  'expire_pending_topups closes stale pending topups'
);

select ok(
  not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE'),
  'credit_topup remains internal-only'
);

select is(
  public.reconcile_ledger(),
  0::bigint,
  'ledger remains reconciled after topup tests'
);

select ok(
  not exists(
    select 1 from public.balances
    where account='wallet' and balance<0
  ),
  'wallet balance invariant remains non-negative'
);

select * from finish();
rollback;
