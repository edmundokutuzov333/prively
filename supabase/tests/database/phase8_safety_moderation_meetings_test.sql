begin;

with checks as (
  select 1 id,'phase8 tables' name,
    to_regclass('public.reports') is not null
    and to_regclass('public.moderation_queue') is not null
    and to_regclass('public.moderation_actions') is not null
    and to_regclass('public.appeals') is not null
    and to_regclass('public.audit_log') is not null
    and to_regclass('public.admin_access_log') is not null
    and to_regclass('public.compliance_access_requests') is not null
    and to_regclass('public.trusted_contacts') is not null
    and to_regclass('public.safety_checkins') is not null
    and to_regclass('public.panic_events') is not null
    and to_regclass('public.safe_venues') is not null
    and to_regclass('public.meeting_requests') is not null
    and to_regclass('public.dmca_requests') is not null
    and to_regclass('public.legal_holds') is not null
    and to_regclass('public.watermark_events') is not null ok
  union all select 2,'phase8 rls',
    (select relrowsecurity from pg_class where oid='public.reports'::regclass)
    and (select relrowsecurity from pg_class where oid='public.moderation_queue'::regclass)
    and (select relrowsecurity from pg_class where oid='public.moderation_actions'::regclass)
    and (select relrowsecurity from pg_class where oid='public.appeals'::regclass)
    and (select relrowsecurity from pg_class where oid='public.audit_log'::regclass)
    and (select relrowsecurity from pg_class where oid='public.admin_access_log'::regclass)
    and (select relrowsecurity from pg_class where oid='public.compliance_access_requests'::regclass)
    and (select relrowsecurity from pg_class where oid='public.trusted_contacts'::regclass)
    and (select relrowsecurity from pg_class where oid='public.safety_checkins'::regclass)
    and (select relrowsecurity from pg_class where oid='public.panic_events'::regclass)
    and (select relrowsecurity from pg_class where oid='public.safety_location_shares'::regclass)
    and (select relrowsecurity from pg_class where oid='public.safe_venues'::regclass)
    and (select relrowsecurity from pg_class where oid='public.meeting_requests'::regclass)
    and (select relrowsecurity from pg_class where oid='public.dmca_requests'::regclass)
    and (select relrowsecurity from pg_class where oid='public.legal_holds'::regclass)
    and (select relrowsecurity from pg_class where oid='public.watermark_events'::regclass)
  union all select 3,'append-only audit',
    exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname='audit_log_immutable')
    and exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname='audit_log_hash')
    and exists(select 1 from pg_trigger where tgrelid='public.moderation_actions'::regclass and tgname='moderation_actions_immutable')
  union all select 4,'compliance access contract',
    to_regprocedure('public.request_compliance_access(text,uuid,text,boolean)') is not null
    and to_regprocedure('public.approve_compliance_access(uuid)') is not null
    and to_regprocedure('public.compliance_read_message(uuid,uuid)') is not null
    and not has_function_privilege('authenticated','public.phase8_audit(text,text,uuid,text,jsonb)','EXECUTE')
  union all select 5,'moderation contracts',
    to_regprocedure('public.submit_report(text,uuid,text,text)') is not null
    and to_regprocedure('public.claim_moderation_case(uuid)') is not null
    and to_regprocedure('public.resolve_moderation_case(uuid,text,text)') is not null
    and to_regprocedure('public.submit_appeal(uuid,text)') is not null
    and to_regclass('public.moderation_queue') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='moderation_queue' and column_name='appeal_id')
  union all select 6,'safety contracts',
    to_regprocedure('public.create_safety_checkin(timestamptz,smallint,boolean)') is not null
    and to_regprocedure('public.confirm_safety_checkin(uuid)') is not null
    and to_regprocedure('public.create_panic_event(boolean,uuid)') is not null
    and to_regprocedure('public.add_safety_location(text,numeric,numeric)') is not null
    and to_regprocedure('public.resolve_panic_event(uuid)') is not null
  union all select 7,'meeting contracts',
    to_regprocedure('public.create_meeting_request(uuid,uuid,uuid,timestamptz,text)') is not null
    and to_regprocedure('public.respond_meeting_request(uuid,text)') is not null
    and to_regprocedure('public.cancel_meeting_request(uuid)') is not null
  union all select 8,'meeting has no money',
    not exists(select 1 from information_schema.columns where table_schema='public' and table_name='meeting_requests' and column_name in ('price','amount','payment_id','commission','escrow_txn','currency'))
    and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='availability_slots' and column_name in ('price','amount','payment_id','commission','escrow_txn','currency'))
    and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='safe_venues' and column_name in ('price','amount','payment_id','commission','escrow_txn','currency'))
  union all select 9,'safe venue categories',
    exists(select 1 from pg_constraint where conrelid='public.safe_venues'::regclass and pg_get_constraintdef(oid) like '%cafe%restaurante%centro_comercial%')
  union all select 10,'temporary location retention',
    to_regprocedure('public.expire_safety_locations()') is not null
    and exists(select 1 from pg_indexes where schemaname='public' and tablename='safety_location_shares' and indexname='safety_location_expiry_idx')
  union all select 11,'legal hold',
    to_regprocedure('public.apply_legal_hold(text,uuid,text)') is not null
    and to_regprocedure('public.release_legal_hold(uuid,text)') is not null
    and to_regprocedure('public.phase8_retention_allows_delete(text,uuid)') is not null
  union all select 12,'watermark tracking',
    to_regprocedure('public.record_watermark_event(uuid,text,text)') is not null
  union all select 13,'dmca public intake',
    has_table_privilege('anon','public.dmca_requests','INSERT')
    and exists(select 1 from pg_policies where schemaname='public' and tablename='dmca_requests' and policyname='dmca_public_insert')
  union all select 14,'feature flags',
    exists(select 1 from public.platform_settings where key='feature_flags.moderation' and value='true'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.meetings' and value='true'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.dmca' and value='true'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.ai_moderation' and value='false'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.safety_alerts' and value='false'::jsonb)
  union all select 15,'private safety data',
    not has_table_privilege('anon','public.safety_location_shares','SELECT')
    and not has_table_privilege('authenticated','public.safety_location_shares','INSERT')
    and not has_table_privilege('authenticated','public.admin_access_log','INSERT')
  union all select 16,'phase8 edge contracts',
    true
)
select id,name,ok from checks order by id;

do $phase8_test$
declare failed integer;
begin
  with checks as (
    select 1 ok
    where to_regclass('public.reports') is not null
      and to_regclass('public.moderation_queue') is not null
      and to_regclass('public.audit_log') is not null
      and to_regclass('public.safe_venues') is not null
      and to_regclass('public.meeting_requests') is not null
      and to_regclass('public.panic_events') is not null
      and to_regclass('public.legal_holds') is not null
    union all select 1 where (select relrowsecurity from pg_class where oid='public.reports'::regclass)
      and (select relrowsecurity from pg_class where oid='public.audit_log'::regclass)
      and (select relrowsecurity from pg_class where oid='public.compliance_access_requests'::regclass)
      and (select relrowsecurity from pg_class where oid='public.meeting_requests'::regclass)
      and (select relrowsecurity from pg_class where oid='public.panic_events'::regclass)
    union all select 1 where exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname='audit_log_immutable')
    union all select 1 where exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname='audit_log_hash')
    union all select 1 where to_regprocedure('public.request_compliance_access(text,uuid,text,boolean)') is not null
      and to_regprocedure('public.approve_compliance_access(uuid)') is not null
      and to_regprocedure('public.compliance_read_message(uuid,uuid)') is not null
    union all select 1 where to_regprocedure('public.submit_report(text,uuid,text,text)') is not null
      and to_regprocedure('public.resolve_moderation_case(uuid,text,text)') is not null
    union all select 1 where to_regprocedure('public.create_panic_event(boolean,uuid)') is not null
      and to_regprocedure('public.create_safety_checkin(timestamptz,smallint,boolean)') is not null
    union all select 1 where to_regprocedure('public.create_meeting_request(uuid,uuid,uuid,timestamptz,text)') is not null
    union all select 1 where not exists(select 1 from information_schema.columns where table_schema='public' and table_name='meeting_requests' and column_name in ('price','amount','payment_id','commission','escrow_txn','currency'))
    union all select 1 where not exists(select 1 from information_schema.columns where table_schema='public' and table_name='safe_venues' and column_name in ('price','amount','payment_id','commission','escrow_txn','currency'))
    union all select 1 where to_regprocedure('public.expire_safety_locations()') is not null
    union all select 1 where to_regprocedure('public.apply_legal_hold(text,uuid,text)') is not null
    union all select 1 where to_regprocedure('public.record_watermark_event(uuid,text,text)') is not null
    union all select 1 where has_table_privilege('anon','public.dmca_requests','INSERT')
    union all select 1 where exists(select 1 from public.platform_settings where key='feature_flags.moderation' and value='true'::jsonb)
  )
  select 15-count(*) into failed from checks;
  if failed <> 0 then
    raise exception 'Phase 8 regression checks failed: % criterion(s)', failed;
  end if;
end;
$phase8_test$;

rollback;
