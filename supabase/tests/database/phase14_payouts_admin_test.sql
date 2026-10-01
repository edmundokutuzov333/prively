begin;
select plan(20);

select ok(to_regclass('public.payouts') is not null, 'payouts exists');
select ok((select relrowsecurity from pg_class where oid='public.payouts'::regclass), 'payouts RLS enabled');
select ok(not has_table_privilege('authenticated','public.payouts','INSERT'), 'authenticated cannot insert payouts directly');
select ok(not has_table_privilege('authenticated','public.payouts','UPDATE'), 'authenticated cannot update payouts directly');
select ok(not has_table_privilege('authenticated','public.payouts','DELETE'), 'authenticated cannot delete payouts directly');
select ok(has_function_privilege('authenticated','public.request_payout(bigint,text,jsonb,text)','EXECUTE'), 'request_payout RPC granted');
select ok(has_function_privilege('authenticated','public.get_creator_earnings_summary()','EXECUTE'), 'earnings summary RPC granted');
select ok(has_function_privilege('authenticated','public.get_admin_storage_status()','EXECUTE'), 'admin storage RPC granted');
select ok(exists(select 1 from pg_trigger where tgrelid='public.audit_log'::regclass and tgname='audit_log_immutable'), 'audit log immutable trigger exists');
select ok(not has_table_privilege('authenticated','public.audit_log','UPDATE'), 'authenticated cannot update audit log directly');
select ok(not has_table_privilege('authenticated','public.audit_log','DELETE'), 'authenticated cannot delete audit log directly');
select ok((select relrowsecurity from pg_class where oid='public.backup_runs'::regclass), 'backup_runs RLS enabled');
select ok(position('for update' in lower(pg_get_functiondef('public.request_payout(bigint,text,jsonb,text)'::regprocedure))) > 0, 'request_payout locks available balance');
select ok(position('idempotency_key' in lower(pg_get_functiondef('public.request_payout(bigint,text,jsonb,text)'::regprocedure))) > 0, 'request_payout is idempotent');

select set_config('app.internal_write','on',true);

insert into auth.users(id,aud,role,email,encrypted_password,phone,phone_confirmed_at,raw_user_meta_data)
values(
  '71400000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'phase14-finance@example.test',
  'test',
  '+258840000001',
  now(),
  '{}'::jsonb
)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status,age_verified_at)
values(
  '71400000-0000-0000-0000-000000000001',
  'phase14_finance',
  'Phase 14 Finance',
  'active',
  now()
)
on conflict(id) do update set status='active',age_verified_at=now();

insert into public.user_roles(user_id,role)
values('71400000-0000-0000-0000-000000000001','creator')
on conflict do nothing;

insert into public.kyc_verifications(user_id,provider,status,reviewed_by,reviewed_at)
values(
  '71400000-0000-0000-0000-000000000001',
  'manual',
  'approved',
  '71400000-0000-0000-0000-000000000001',
  now()
)
on conflict do nothing;

insert into public.creator_terms_acceptances(user_id,version,declarations)
values(
  '71400000-0000-0000-0000-000000000001',
  '1.0.0',
  '{"adult":true}'::jsonb
);

insert into public.balances(owner_id,account,balance)
values('71400000-0000-0000-0000-000000000001','creator_available',100000)
on conflict(owner_id,account) do update set balance=excluded.balance;

set local role authenticated;
select set_config('request.jwt.claim.sub','71400000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71400000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aal','aal2',
  'amr',json_build_array(json_build_object('method','phone','timestamp',extract(epoch from now())::bigint))
)::text,true);
select set_config('app.internal_write','off',true);

select lives_ok($$
  select public.request_payout(
    60000,
    'mpesa',
    '{"phone":"+258840000001"}'::jsonb,
    'phase14-idem-001'
  )
$$,'request_payout creates a real payout hold');

select is(
  (select balance from public.balances where owner_id='71400000-0000-0000-0000-000000000001'::uuid and account='creator_available'),
  40000::bigint,
  'available balance is reduced by the payout hold'
);

select is(
  (select count(*) from public.ledger_entries where owner_id='71400000-0000-0000-0000-000000000001'::uuid and kind='payout_hold'),
  2::bigint,
  'payout hold creates creator and escrow ledger entries'
);

select is(
  (select public.request_payout(
    60000,
    'mpesa',
    '{"phone":"+258840000001"}'::jsonb,
    'phase14-idem-001'
  )),
  (select id from public.payouts where owner_id='71400000-0000-0000-0000-000000000001'::uuid and idempotency_key='phase14-idem-001'),
  'duplicate idempotency key returns existing payout'
);

select throws_ok($$
  select public.request_payout(
    50000,
    'mpesa',
    '{"phone":"+258840000001"}'::jsonb,
    'phase14-idem-002'
  )
$$,'insufficient_available_earnings','second payout cannot exceed remaining available balance');

select * from finish();
rollback;