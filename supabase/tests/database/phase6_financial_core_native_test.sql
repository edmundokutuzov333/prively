with checks as (
  select 'financial_tables' name,
    to_regclass('public.topups') is not null
    and to_regclass('public.payment_webhook_events') is not null
    and to_regclass('public.payouts') is not null
    and to_regclass('public.fx_rates') is not null
    and to_regclass('public.refunds') is not null
    and to_regclass('public.invoices') is not null ok
  union all select 'financial_rls',
    (select relrowsecurity from pg_class where oid='public.topups'::regclass)
    and (select relrowsecurity from pg_class where oid='public.payouts'::regclass)
    and (select relrowsecurity from pg_class where oid='public.fx_rates'::regclass)
  union all select 'ledger_direct_insert_blocked',
    not has_table_privilege('anon','public.ledger_entries','INSERT')
    and not has_table_privilege('authenticated','public.ledger_entries','INSERT')
  union all select 'balance_direct_update_blocked',
    not has_table_privilege('anon','public.balances','UPDATE')
    and not has_table_privilege('authenticated','public.balances','UPDATE')
  union all select 'idempotency_direct_insert_blocked',
    not has_table_privilege('anon','public.idempotency_keys','INSERT')
    and not has_table_privilege('authenticated','public.idempotency_keys','INSERT')
  union all select 'credit_topup_internal',
    not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE')
    and has_function_privilege('service_role','public.credit_topup(text,text,bigint,text)','EXECUTE')
  union all select 'topup_intent_public_contract',
    has_function_privilege('authenticated','public.create_topup_intent(bigint,text,text)','EXECUTE')
  union all select 'payout_contracts',
    has_function_privilege('authenticated','public.request_payout(bigint,text,jsonb,text)','EXECUTE')
    and has_function_privilege('authenticated','public.approve_payout(uuid)','EXECUTE')
    and has_function_privilege('authenticated','public.reject_payout(uuid,text)','EXECUTE')
  union all select 'reconciliation_contract',
    to_regprocedure('public.reconcile_ledger()') is not null
    and exists(select 1 from cron.job where jobname='prively-reconcile-ledger' and active)
  union all select 'ledger_zero_sum_trigger',
    exists(select 1 from pg_trigger where tgrelid='public.ledger_entries'::regclass and tgname='trg_ledger_txn_balanced' and tgdeferrable)
  union all select 'ledger_immutable',
    exists(select 1 from pg_trigger where tgrelid='public.ledger_entries'::regclass and tgname='trg_ledger_no_update')
  union all select 'wallet_nonnegative',
    not exists(select 1 from public.balances where account='wallet' and balance<0)
  union all select 'financial_settings',
    exists(select 1 from public.platform_settings where key='commission.default')
    and exists(select 1 from public.platform_settings where key='hold_hours')
    and exists(select 1 from public.platform_settings where key='payout.min_centavos')
    and exists(select 1 from public.platform_settings where key='payment.methods')
    and exists(select 1 from public.platform_settings where key='fx_rates.config')
  union all select 'card_disabled',
    (select value->>'card' from public.platform_settings where key='payment.methods')='false'
  union all select 'subscription_contracts',
    to_regprocedure('public.subscribe_to_tier(uuid,smallint,text)') is not null
    and to_regprocedure('public.cancel_subscription(uuid)') is not null
    and to_regprocedure('public.renew_due_subscriptions()') is not null
  union all select 'refund_contract',
    to_regprocedure('public.refund_transaction(uuid,bigint,text)') is not null
  union all select 'fx_contracts',
    to_regprocedure('public.get_fx_rate(text,text)') is not null
    and to_regprocedure('public.set_fx_rate(text,text,numeric,text)') is not null
  union all select 'payout_payload_private',
    not has_function_privilege('anon','public.get_payout_execution_payload(uuid)','EXECUTE')
  union all select 'financial_audit_policy',
    exists(select 1 from pg_policies where schemaname='public' and tablename='financial_audit_log' and policyname='financial_audit_read' and cmd='SELECT')
  union all select 'reconciliation_tables',
    to_regclass('public.financial_reconciliation_runs') is not null
    and to_regclass('public.financial_audit_log') is not null
)
select *,
  (select count(*) from checks where not ok) as failed_checks,
  (select count(*) from checks) as total_checks
from checks;