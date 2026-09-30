-- Creator Terms native regression suite.
-- Runs entirely against PostgreSQL/Supabase. No mocked acceptance path.

begin;

create temp table _creator_terms_test_meta(key text primary key, value text);

do $$
declare
  current_version text;
  constraint_ok boolean;
  creator_uid uuid;
begin
  select value #>> '{}' into current_version
  from public.platform_settings
  where key = 'legal.creator_terms_version';

  if current_version <> '1.0.0' then
    raise exception 'FAIL: expected creator terms version 1.0.0, got %', current_version;
  end if;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.legal_acceptances'::regclass
      and conname = 'legal_acceptances_document_type_check'
      and pg_get_constraintdef(oid) like '%creator_terms%'
  ) into constraint_ok;

  if not constraint_ok then
    raise exception 'FAIL: legal acceptance constraint does not permit creator_terms';
  end if;

  select ur.user_id
    into creator_uid
  from public.user_roles ur
  where ur.role = 'creator'
  order by ur.created_at
  limit 1;

  if creator_uid is null then
    creator_uid := 'c7000000-0000-0000-0000-000000000001'::uuid;
    perform set_config('app.internal_write','on',true);
    insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
    values(
      creator_uid,'authenticated','authenticated','creator.terms.native@example.test','test',
      jsonb_build_object('handle','creator_terms_native'),now(),now(),now()
    )
    on conflict(id) do nothing;
    insert into public.profiles(id,handle,display_name,status,age_verified_at)
    values(creator_uid,'creator_terms_native','Creator Terms Native','active',now())
    on conflict(id) do nothing;
    insert into public.user_roles(user_id,role) values(creator_uid,'creator')
    on conflict do nothing;
    insert into public.kyc_verifications(user_id,provider,status,provider_ref,reviewed_at)
    values(creator_uid,'native-test','approved','native:'||creator_uid::text,now())
    on conflict do nothing;
  end if;

  insert into _creator_terms_test_meta values ('creator_uid', creator_uid::text);
end
$$;

insert into _creator_terms_test_meta
select 'commission.subscription', public.commission_rate(null, 'subscription')::text
union all select 'commission.ppv', public.commission_rate(null, 'ppv')::text
union all select 'commission.message', public.commission_rate(null, 'message')::text
union all select 'commission.live', public.commission_rate(null, 'live_ticket')::text
union all select 'commission.tip', public.commission_rate(null, 'tip')::text
union all select 'commission.meeting', public.commission_rate(null, 'meeting')::text;

do $$
declare
  v numeric;
begin
  select value::numeric into v from _creator_terms_test_meta where key='commission.subscription';
  if v <> 0.20 then raise exception 'FAIL: subscription commission must be 20%%, got %', v; end if;
  select value::numeric into v from _creator_terms_test_meta where key='commission.ppv';
  if v <> '0.20' then raise exception 'FAIL: PPV commission must be 20%%, got %', v; end if;
  select value::numeric into v from _creator_terms_test_meta where key='commission.message';
  if v <> '0.20' then raise exception 'FAIL: message commission must be 20%%, got %', v; end if;
  select value::numeric into v from _creator_terms_test_meta where key='commission.live';
  if v <> '0.20' then raise exception 'FAIL: live commission must be 20%%, got %', v; end if;
  select value::numeric into v from _creator_terms_test_meta where key='commission.tip';
  if v <> 0.10 then raise exception 'FAIL: tip commission must be 10%%, got %', v; end if;
  select value::numeric into v from _creator_terms_test_meta where key='commission.meeting';
  if v <> 0 then raise exception 'FAIL: meeting commission must be 0%%, got %', v; end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  (select value from _creator_terms_test_meta where key='creator_uid'),
  true
);

do $$
declare
  status_row record;
  acceptance_id uuid;
  declarations jsonb := jsonb_build_object(
    'age_18',true,
    'accept_terms',true,
    'commission_rates',true,
    'identity_verification',true,
    'all_involved_adults_consent',true,
    'encounters_not_prively',true,
    'prohibited_content',true,
    'content_rights',true,
    'privacy_sensitive_data',true,
    'pending_balance_retention',true,
    'no_illegal_use',true,
    'no_income_guarantee',true,
    'essential_communications',true,
    'truthful_information',true,
    'suspension_termination',true,
    'mozambique_law_maputo_forum',true
  );
begin
  select * into status_row from public.get_creator_terms_status();
  if status_row.accepted then
    raise exception 'FAIL: creator test fixture unexpectedly already accepted current creator terms';
  end if;

  acceptance_id := public.accept_creator_terms(
    '1.0.0',
    declarations,
    'native-test',
    '{"suite":"creator_terms_native_test"}'::jsonb
  );

  if acceptance_id is null then
    raise exception 'FAIL: valid creator terms acceptance returned null';
  end if;

  select * into status_row from public.get_creator_terms_status();
  if not status_row.accepted or status_row.current_version <> '1.0.0' then
    raise exception 'FAIL: accepted creator terms status was not visible';
  end if;

  if not exists (
    select 1 from public.creator_terms_acceptances cta
    where cta.id=acceptance_id
      and user_id=auth.uid()
      and version='1.0.0'
      and jsonb_object_length(cta.declarations)=16
  ) then
    raise exception 'FAIL: normalized creator terms acceptance was not persisted correctly';
  end if;

  if not exists (
    select 1 from public.legal_acceptances
    where user_id=auth.uid()
      and document_type='creator_terms'
      and version='1.0.0'
  ) then
    raise exception 'FAIL: legal_acceptances did not receive creator_terms record';
  end if;
end
$$;

do $$
declare
  accepted boolean := false;
begin
  begin
    perform public.accept_creator_terms(
      '1.0.0',
      jsonb_build_object('age_18',true),
      'native-test',
      '{}'::jsonb
    );
  exception when others then
    accepted := true;
  end;

  if not accepted then
    raise exception 'FAIL: incomplete declaration payload was accepted';
  end if;
end
$$;

select
  'creator_terms_version' as check_name,
  (select value #>> '{}' from public.platform_settings where key='legal.creator_terms_version') = '1.0.0' as ok
union all
select 'creator_terms_table',
  to_regclass('public.creator_terms_acceptances') is not null
union all
select 'creator_terms_rls',
  relrowsecurity from pg_class where oid='public.creator_terms_acceptances'::regclass
union all
select 'commission_20_default',
  public.commission_rate(null,'subscription') = 0.20
union all
select 'commission_10_tips',
  public.commission_rate(null,'tip') = 0.10
union all
select 'valid_acceptance_path', true
union all
select 'invalid_declarations_rejected', true
union all
select 'creator_terms_server_gate_helper_exists', to_regprocedure('public.has_current_creator_terms(uuid)') is not null;

rollback;

-- Transaction rollback must leave no acceptance artefact behind.
select
  'rollback_left_no_creator_terms_acceptance' as check_name,
  not exists (
    select 1
    from public.creator_terms_acceptances
    where source='native-test'
  ) as ok;
