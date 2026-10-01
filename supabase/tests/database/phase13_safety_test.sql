begin;
select plan(18);

select ok(to_regclass('public.reports') is not null, 'reports exists');
select ok(to_regclass('public.panic_events') is not null, 'panic_events exists');
select ok(to_regclass('public.trusted_contacts') is not null, 'trusted_contacts exists');
select ok((select relrowsecurity from pg_class where oid='public.reports'::regclass), 'reports RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.panic_events'::regclass), 'panic_events RLS enabled');

select ok(not has_table_privilege('authenticated','public.reports','INSERT'), 'authenticated cannot insert reports directly');
select ok(not has_table_privilege('authenticated','public.reports','UPDATE'), 'authenticated cannot update reports directly');
select ok(not has_table_privilege('authenticated','public.panic_events','INSERT'), 'authenticated cannot insert panic events directly');
select ok(not has_table_privilege('authenticated','public.panic_events','DELETE'), 'authenticated cannot delete panic events directly');
select ok(has_function_privilege('authenticated','public.submit_report(text,uuid,text,text)','EXECUTE'), 'submit_report RPC granted');
select ok(has_function_privilege('authenticated','public.create_panic_event(boolean,uuid)','EXECUTE'), 'create_panic_event RPC granted');

select set_config('app.internal_write','on',true);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('71300000-0000-0000-0000-000000000001','authenticated','authenticated','phase13-safety@example.test','test','{}'::jsonb),
  ('71300000-0000-0000-0000-000000000002','authenticated','authenticated','phase13-target@example.test','test','{}'::jsonb)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status,age_verified_at)
values
  ('71300000-0000-0000-0000-000000000001','phase13_safety','Phase 13 Safety','active',now()),
  ('71300000-0000-0000-0000-000000000002','phase13_target','Phase 13 Target','active',now())
on conflict(id) do update set status='active', age_verified_at=now();

set local role authenticated;
select set_config('request.jwt.claim.sub','71300000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71300000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aal','aal1'
)::text,true);
select set_config('app.internal_write','off',true);

select lives_ok($$
  select public.submit_report(
    'profile',
    '71300000-0000-0000-0000-000000000002'::uuid,
    'harassment',
    'Teste transitório da denúncia na Fase 13.'
  )
$$,'submit_report creates a real report');

select is(
  (select count(*) from public.audit_log where event_type='report_created' and target_type='profile' and target_id='71300000-0000-0000-0000-000000000002'::uuid),
  1::bigint,
  'report creation is audited'
);

select lives_ok($$
  select public.create_panic_event(false, null)
$$,'create_panic_event creates a real panic incident');

select is(
  (select count(*) from public.panic_events
    where user_id='71300000-0000-0000-0000-000000000001'::uuid
      and share_location=false),
  1::bigint,
  'panic incident is persisted for the authenticated user'
);

select is(
  (select count(*) from public.audit_log
    where event_type='panic_event_created'
      and target_type='panic_event'),
  1::bigint,
  'panic creation is audited'
);

select * from finish();
rollback;
