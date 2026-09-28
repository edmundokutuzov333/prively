begin;

select plan(24);

select ok(
  to_regclass('public.topups') is not null
  and to_regclass('public.payment_webhook_events') is not null
  and to_regclass('public.payouts') is not null
  and to_regclass('public.fx_rates') is not null
  and to_regclass('public.refunds') is not null
  and to_regclass('public.invoices') is not null,
  'Phase 6 financial tables exist'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.topups'::regclass)
  and (select relrowsecurity from pg_class where oid='public.payouts'::regclass)
  and (select relrowsecurity from pg_class where oid='public.fx_rates'::regclass),
  'financial tables use RLS'
);

select ok(
  not has_table_privilege('anon','public.ledger_entries','INSERT')
  and not has_table_privilege('authenticated','public.ledger_entries','INSERT'),
  'clients cannot insert ledger entries directly'
);

select ok(
  not has_table_privilege('anon','public.balances','UPDATE')
  and not has_table_privilege('authenticated','public.balances','UPDATE'),
  'clients cannot mutate balances directly'
);

select ok(
  not has_table_privilege('anon','public.idempotency_keys','INSERT')
  and not has_table_privilege('authenticated','public.idempotency_keys','INSERT'),
  'clients cannot mutate idempotency records directly'
);

select ok(
  not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE'),
  'credit_topup is not exposed to authenticated clients'
);

select ok(
  has_function_privilege('service_role','public.credit_topup(text,text,bigint,text)','EXECUTE'),
  'credit_topup is available to the trusted payment worker'
);

select ok(
  has_function_privilege('authenticated','public.create_topup_intent(bigint,text,text)','EXECUTE'),
  'authenticated users can create topup intents'
);

select ok(
  has_function_privilege('authenticated','public.request_payout(bigint,text,jsonb,text)','EXECUTE')
  and has_function_privilege('authenticated','public.approve_payout(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.reject_payout(uuid,text)','EXECUTE'),
  'financial workflow RPCs have authenticated entrypoints'
);

select ok(
  has_function_privilege('authenticated','public.run_financial_reconciliation()','EXECUTE'),
  'finance reconciliation has an authenticated guarded entrypoint'
);

select ok(
  has_function_privilege('authenticated','public.get_financial_settings()','EXECUTE')
  and has_function_privilege('authenticated','public.get_spend_limits()','EXECUTE'),
  'financial UI contracts are available'
);

select ok(
  exists(select 1 from public.platform_settings where key='commission.default')
  and exists(select 1 from public.platform_settings where key='hold_hours')
  and exists(select 1 from public.platform_settings where key='payout.min_centavos')
  and exists(select 1 from public.platform_settings where key='payment.methods')
  and exists(select 1 from public.platform_settings where key='fx_rates.config'),
  'required Phase 6 settings contracts exist'
);

select ok(
  (select value->>'card' from public.platform_settings where key='payment.methods')='false',
  'card payments remain behind a disabled production flag'
);

select ok(
  (select conname from pg_constraint
   where conrelid='public.ledger_entries'::regclass
     and conname='ledger_entries_amount_nonzero') is not null,
  'ledger rejects zero-value postings'
);

select ok(
  exists(
    select 1
    from pg_trigger t
    where t.tgrelid='public.ledger_entries'::regclass
      and t.tgname='trg_ledger_txn_balanced'
      and t.tgdeferrable
  ),
  'ledger balance invariant is a deferred constraint trigger'
);

select is(
  public.reconcile_ledger(),
  0::bigint,
  'clean production ledger currently reconciles without differences'
);

select ok(
  exists(select 1 from cron.job where jobname='prively-renew-subscriptions' and active)
  and exists(select 1 from cron.job where jobname='prively-expire-topups' and active)
  and exists(select 1 from cron.job where jobname='prively-reconcile-ledger-v2' and active)
  and exists(select 1 from cron.job where jobname='prively-fx-refresh-hourly' and active),
  'Phase 6 scheduled jobs are active'
);

select ok(
  to_regprocedure('public.subscribe_to_tier(uuid,smallint,text)') is not null
  and to_regprocedure('public.cancel_subscription(uuid)') is not null
  and to_regprocedure('public.renew_due_subscriptions()') is not null,
  'subscription purchase and renewal contracts exist'
);

select ok(
  to_regprocedure('public.refund_transaction(uuid,bigint,text)') is not null,
  'refund reversal contract exists'
);

select ok(
  to_regprocedure('public.get_fx_rate(text,text)') is not null
  and to_regprocedure('public.set_fx_rate(text,text,numeric,text)') is not null,
  'FX read and admin write contracts exist'
);

select ok(
  not has_function_privilege('anon','public.get_payout_execution_payload(uuid)','EXECUTE'),
  'payout destination access is not exposed anonymously'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='financial_audit_log'
      and policyname='financial_audit_read'
      and cmd='SELECT'
  ),
  'financial audit log has explicit read policy'
);

select ok(
  to_regclass('public.financial_reconciliation_runs') is not null
  and to_regclass('public.financial_audit_log') is not null,
  'financial reconciliation and audit tables exist'
);

select ok(
  exists(
    select 1 from public.balances
    where account='wallet' and balance<0
  ) = false,
  'wallet balances are never negative'
);

select * from finish();
rollback;