with checks as (
  select 'all_public_tables_rls' name,
    not exists(
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and not c.relrowsecurity
    ) ok
  union all select 'all_public_tables_have_policies',
    not exists(
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)=0
    )
  union all select 'all_storage_buckets_private',
    not exists(select 1 from storage.buckets where public)
  union all select 'ledger_reconciles', coalesce(public.reconcile_ledger(),0)=0
  union all select 'wallet_nonnegative',
    not exists(select 1 from public.balances where account='wallet' and balance<0)
  union all select 'rate_limits_table_private',
    (select relrowsecurity from pg_class where oid='public.security_rate_limits'::regclass)
    and not has_table_privilege('anon','public.security_rate_limits','SELECT')
    and not has_table_privilege('authenticated','public.security_rate_limits','SELECT')
  union all select 'rate_limit_triggers',
    exists(select 1 from pg_trigger where tgrelid='public.reports'::regclass and tgname='trg_phase10_report_rate_limit')
    and exists(select 1 from pg_trigger where tgrelid='public.topups'::regclass and tgname='trg_phase10_topup_rate_limit')
    and exists(select 1 from pg_trigger where tgrelid='public.payouts'::regclass and tgname='trg_phase10_payout_rate_limit')
    and exists(select 1 from pg_trigger where tgrelid='public.messages'::regclass and tgname='trg_phase10_message_rate_limit')
  union all select 'rate_limit_internal',
    not has_function_privilege('anon','public.phase10_assert_rate_limit(text,text,integer,integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.phase10_assert_rate_limit(text,text,integer,integer)','EXECUTE')
  union all select 'critical_cron',
    exists(select 1 from cron.job where jobname='prively-reconcile-ledger' and active)
    and exists(select 1 from cron.job where jobname='prively-renew-subscriptions' and active)
    and exists(select 1 from cron.job where jobname='prively-release-earnings' and active)
    and exists(select 1 from cron.job where jobname='prively-refresh-analytics' and active)
    and exists(select 1 from cron.job where jobname='prively-refresh-rankings' and active)
  union all select 'media_security_contracts',
    to_regprocedure('public.can_view_post(uuid)') is not null
    and to_regprocedure('public.get_media_access(uuid)') is not null
  union all select 'financial_security_contracts',
    not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE')
    and to_regprocedure('public.request_payout(bigint,text,jsonb,text)') is not null
  union all select 'audit_append_only',
    exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname like '%no_update%')
  union all select 'client_error_private',
    (select relrowsecurity from pg_class where oid='public.client_error_events'::regclass)
    and not has_table_privilege('anon','public.client_error_events','SELECT')
  union all select 'production_gate_off',
    coalesce((select value='false'::jsonb from public.platform_settings where key='production.launch_enabled'),false)
  union all select 'external_launch_blockers_off',
    coalesce((select value='false'::jsonb from public.platform_settings where key='production.legal_reviewed'),false)
    and coalesce((select value='false'::jsonb from public.platform_settings where key='production.external_security_tested'),false)
    and coalesce((select value='false'::jsonb from public.platform_settings where key='production.backups_validated'),false)
  union all select 'phase7_regression_contract',
    to_regprocedure('public.send_message_v2(uuid,text,text,uuid,text)') is not null
    and to_regprocedure('public.start_call(uuid,text,text)') is not null
  union all select 'phase8_regression_contract',
    to_regprocedure('public.submit_report(text,uuid,text,text)') is not null
    and to_regprocedure('public.get_safety_incidents(uuid,integer)') is not null
  union all select 'phase9_regression_contract',
    to_regprocedure('public.create_custom_request(uuid,text,bigint,text)') is not null
    and to_regprocedure('public.create_auction_v2(uuid,text,text,bigint,bigint,timestamptz,timestamptz,uuid)') is not null
    and to_regprocedure('public.create_order_v2(jsonb,text,text,text,text)') is not null
  union all select 'health_contract',
    to_regprocedure('public.get_health_probe()') is not null
)
select *,
  (select count(*) from checks where not ok) as failed_checks,
  (select count(*) from checks) as total_checks
from checks;