begin;

select plan(6);

select ok((select relrowsecurity from pg_class where oid='public.channels'::regclass), 'channels RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='channels' and policyname='channels_read'),0::bigint,'legacy channel read policy is removed');
select ok(not has_table_privilege('authenticated','public.channels','INSERT'),'authenticated still cannot insert channels directly');
select ok(exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='channels' and column_name='is_seed'
), 'seed marker exists');

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values(
  '74000000-0000-0000-0000-000000000004',
  'authenticated',
  'authenticated',
  'phase3-seed-viewer@example.test',
  'test',
  '{}'::jsonb
),
(
  '74000000-0000-0000-0000-000000000005',
  'authenticated',
  'authenticated',
  'phase3-seed-owner@example.test',
  'test',
  '{}'::jsonb
)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status)
values(
  '74000000-0000-0000-0000-000000000004',
  'phase3_seed_viewer',
  'Phase 3 Seed Viewer',
  'active'
),
(
  '74000000-0000-0000-0000-000000000005',
  'phase3_seed_owner',
  'Phase 3 Seed Owner',
  'active'
)
on conflict(id) do nothing;

set local role service_role;

insert into public.kyc_verifications(id,user_id,provider,status,created_at)
values(
  '74000000-0000-0000-0000-000000000704',
  '74000000-0000-0000-0000-000000000004',
  'manual',
  'approved',
  now()
)
on conflict(id) do nothing;

update public.profiles
set age_verified_at=now(), status='active'
where id='74000000-0000-0000-0000-000000000004';

insert into public.channels(id,owner_id,handle,display_name,is_seed)
values(
  '74000000-0000-0000-0000-000000000701',
  '74000000-0000-0000-0000-000000000005',
  'phase3_seed_visibility',
  'Phase 3 Seed Visibility',
  true
)
on conflict(id) do nothing;

set local role authenticated;

select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','74000000-0000-0000-0000-000000000004',
  'role','authenticated',
  'aud','authenticated',
  'aal','aal2'
)::text,true);

select is(
  (select count(*) from public.channels where id='74000000-0000-0000-0000-000000000701'::uuid),
  0::bigint,
  'seed channels are hidden from verified users through public channel reads'
);

select is(
  (select count(*) from public.channels where is_seed=false and handle='criadora_test'),
  0::bigint,
  'production synthetic channel is not publicly classified as non-seed'
);

select * from finish();
rollback;
