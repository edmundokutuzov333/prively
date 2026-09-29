
-- Prively Fase 10: Production Hardening, Integration & Launch.
-- No production launch is enabled by this migration. External/legal/security gates
-- remain explicit blockers until independently validated.

create table if not exists public.security_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash, window_started_at)
);

alter table public.security_rate_limits enable row level security;
revoke all on public.security_rate_limits from anon, authenticated;

create or replace function public.phase10_rate_limit_key(_subject text)
returns text
language sql
immutable
security definer
set search_path=public,extensions
as $$
  select encode(extensions.digest(convert_to(coalesce(_subject,''),'utf8'),'sha256'),'hex')
$$;

create or replace function public.phase10_assert_rate_limit(
  _scope text,
  _subject text,
  _limit integer,
  _window_seconds integer
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hash text;
  v_start timestamptz;
  v_count integer;
  v_lock bigint;
begin
  if _scope is null or trim(_scope)='' then raise exception 'rate_limit_scope_required'; end if;
  if _limit <= 0 or _window_seconds <= 0 then raise exception 'rate_limit_config_invalid'; end if;

  v_hash:=public.phase10_rate_limit_key(coalesce(_subject,coalesce(auth.uid()::text,'anonymous')));
  v_start:=to_timestamp(
    floor(extract(epoch from now()) / _window_seconds) * _window_seconds
  );
  v_lock:=hashtextextended(_scope||':'||v_hash||':'||v_start::text,0);
  perform pg_advisory_xact_lock(v_lock);

  insert into public.security_rate_limits(scope,subject_hash,window_started_at,hit_count,updated_at)
  values(_scope,v_hash,v_start,1,now())
  on conflict(scope,subject_hash,window_started_at)
  do update set hit_count=public.security_rate_limits.hit_count+1,updated_at=now()
  returning hit_count into v_count;

  if v_count > _limit then
    raise exception 'rate_limit_exceeded'
      using detail=json_build_object(
        'scope',_scope,
        'limit',_limit,
        'window_seconds',_window_seconds,
        'retry_after_seconds',greatest(1,ceil(extract(epoch from((v_start + make_interval(secs=>_window_seconds))-now()))))
      )::text;
  end if;
end
$$;

create or replace function public.phase10_rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid;
begin
  actor:=coalesce(
    case when TG_TABLE_NAME='reports' then NEW.reporter_id end,
    case when TG_TABLE_NAME='topups' then NEW.user_id end,
    case when TG_TABLE_NAME='payouts' then NEW.owner_id end,
    case when TG_TABLE_NAME='messages' then NEW.sender_id end
  );

  if actor is null then return NEW; end if;

  perform public.phase10_assert_rate_limit(
    case TG_TABLE_NAME
      when 'reports' then 'report'
      when 'topups' then 'topup'
      when 'payouts' then 'payout'
      when 'messages' then 'message'
      else TG_TABLE_NAME
    end,
    actor::text,
    case TG_TABLE_NAME
      when 'reports' then 10
      when 'topups' then 6
      when 'payouts' then 3
      when 'messages' then 60
      else 30
    end,
    case TG_TABLE_NAME
      when 'reports' then 3600
      when 'topups' then 3600
      when 'payouts' then 86400
      when 'messages' then 60
      else 3600
    end
  );
  return NEW;
end
$$;

drop trigger if exists trg_phase10_report_rate_limit on public.reports;
create trigger trg_phase10_report_rate_limit
before insert on public.reports
for each row execute function public.phase10_rate_limit_trigger();

drop trigger if exists trg_phase10_topup_rate_limit on public.topups;
create trigger trg_phase10_topup_rate_limit
before insert on public.topups
for each row execute function public.phase10_rate_limit_trigger();

drop trigger if exists trg_phase10_payout_rate_limit on public.payouts;
create trigger trg_phase10_payout_rate_limit
before insert on public.payouts
for each row execute function public.phase10_rate_limit_trigger();

drop trigger if exists trg_phase10_message_rate_limit on public.messages;
create trigger trg_phase10_message_rate_limit
before insert on public.messages
for each row execute function public.phase10_rate_limit_trigger();

create index if not exists security_rate_limits_updated_idx
  on public.security_rate_limits(updated_at desc);

create or replace function public.phase10_purge_rate_limits()
returns integer
language sql
security definer
set search_path=public
as $$
  with deleted as (
    delete from public.security_rate_limits
    where window_started_at < now() - interval '2 days'
    returning 1
  )
  select count(*) from deleted
$$;

insert into public.platform_settings(key,value)
values
  ('production.launch_enabled','false'::jsonb),
  ('production.environment','production'::jsonb),
  ('production.external_security_tested','false'::jsonb),
  ('production.legal_reviewed','false'::jsonb),
  ('production.terms_published','false'::jsonb),
  ('production.privacy_published','false'::jsonb),
  ('production.kyc_provider_verified','false'::jsonb),
  ('production.moderation_team_verified','false'::jsonb),
  ('production.backups_validated','false'::jsonb),
  ('production.recovery_drill_validated','false'::jsonb),
  ('production.payment_provider_verified','false'::jsonb),
  ('production.observability_configured','true'::jsonb),
  ('production.ci_required','true'::jsonb),
  ('production.csp_enabled','true'::jsonb)
on conflict(key) do nothing;

create or replace function public.get_production_readiness()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  checks jsonb;
  launchable boolean;
  table_security_ok boolean;
  buckets_private boolean;
  ledger_ok boolean;
  cron_ok boolean;
  edge_contracts_ok boolean;
begin
  if not public.has_role((select auth.uid()),'admin') then
    raise exception 'admin_required';
  end if;

  select coalesce(bool_and(relrowsecurity and policy_count>0),false)
  into table_security_ok
  from (
    select c.relrowsecurity,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) policy_count
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_tables t on t.schemaname='public' and t.tablename=c.relname
    where n.nspname='public'
      and c.relkind='r'
  ) x;

  select coalesce(bool_and(public=false),true)
  into buckets_private
  from storage.buckets;

  ledger_ok:=(coalesce((select public.reconcile_ledger()),0)=0)
    and not exists(select 1 from public.balances where account='wallet' and balance<0);

  select
    exists(select 1 from cron.job where jobname='prively-reconcile-ledger' and active)
    and exists(select 1 from cron.job where jobname='prively-renew-subscriptions' and active)
    and exists(select 1 from cron.job where jobname='prively-release-earnings' and active)
    and exists(select 1 from cron.job where jobname='prively-refresh-analytics' and active)
    and exists(select 1 from cron.job where jobname='prively-refresh-rankings' and active)
    into cron_ok;

  edge_contracts_ok:=
    to_regprocedure('public.can_view_post(uuid)') is not null
    and to_regprocedure('public.get_media_access(uuid)') is not null
    and to_regprocedure('public.credit_topup(text,text,bigint,text)') is not null
    and to_regprocedure('public.request_payout(bigint,text,jsonb,text)') is not null;

  select jsonb_build_object(
    'database_rls',jsonb_build_object('ok',table_security_ok,'severity','blocker'),
    'storage_private',jsonb_build_object('ok',buckets_private,'severity','blocker'),
    'ledger_reconciliation',jsonb_build_object('ok',ledger_ok,'severity','blocker'),
    'critical_cron',jsonb_build_object('ok',cron_ok,'severity','blocker'),
    'security_contracts',jsonb_build_object('ok',edge_contracts_ok,'severity','blocker'),
    'external_security_tested',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.external_security_tested'),false),'severity','external'),
    'legal_reviewed',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.legal_reviewed'),false),'severity','external'),
    'terms_published',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.terms_published'),false),'severity','external'),
    'privacy_published',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.privacy_published'),false),'severity','external'),
    'kyc_provider_verified',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.kyc_provider_verified'),false),'severity','external'),
    'moderation_team_verified',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.moderation_team_verified'),false),'severity','external'),
    'backups_validated',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.backups_validated'),false),'severity','external'),
    'recovery_drill_validated',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.recovery_drill_validated'),false),'severity','external'),
    'payment_provider_verified',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.payment_provider_verified'),false),'severity','external'),
    'launch_enabled',jsonb_build_object('ok',coalesce((select value='true'::jsonb from public.platform_settings where key='production.launch_enabled'),false),'severity','gate')
  ) into checks;

  launchable:=
    table_security_ok
    and buckets_private
    and ledger_ok
    and cron_ok
    and edge_contracts_ok
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.external_security_tested'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.legal_reviewed'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.terms_published'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.privacy_published'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.kyc_provider_verified'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.moderation_team_verified'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.backups_validated'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.recovery_drill_validated'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.payment_provider_verified'),false)
    and coalesce((select value='true'::jsonb from public.platform_settings where key='production.launch_enabled'),false);

  return jsonb_build_object(
    'launchable',launchable,
    'generated_at',now(),
    'checks',checks
  );
end
$$;

revoke all on function public.phase10_rate_limit_key(text) from public,anon,authenticated;
revoke all on function public.phase10_assert_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.phase10_rate_limit_trigger() from public,anon,authenticated;
revoke all on function public.phase10_purge_rate_limits() from public,anon,authenticated;
revoke all on function public.get_production_readiness() from public,anon;
grant execute on function public.get_production_readiness() to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='prively-phase10-purge-rate-limits';

select cron.schedule(
  'prively-phase10-purge-rate-limits',
  '17 3 * * *',
  'select public.phase10_purge_rate_limits();'
);
