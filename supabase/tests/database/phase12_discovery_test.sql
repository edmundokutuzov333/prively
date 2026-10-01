begin;
select plan(20);

select ok(to_regclass('public.follows') is not null, 'follows exists');
select ok((select relrowsecurity from pg_class where oid='public.follows'::regclass), 'follows RLS enabled');
select ok(not has_table_privilege('authenticated','public.follows','INSERT'), 'authenticated cannot insert follows directly');
select ok(not has_table_privilege('authenticated','public.follows','DELETE'), 'authenticated cannot delete follows directly');
select ok(has_function_privilege('authenticated','public.discover_channels(text,text,text,text,integer,integer)','EXECUTE'), 'discover RPC granted');
select ok(has_function_privilege('authenticated','public.follow_channel(uuid)','EXECUTE'), 'follow RPC granted');
select ok(has_function_privilege('authenticated','public.unfollow_channel(uuid)','EXECUTE'), 'unfollow RPC granted');
select ok(to_regclass('public.follows_channel_id_idx') is not null, 'follow count index exists');

select set_config('app.internal_write','on',true);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('71200000-0000-0000-0000-000000000001','authenticated','authenticated','phase12-client@example.test','test','{"handle":"phase12_client"}'::jsonb),
  ('71200000-0000-0000-0000-000000000002','authenticated','authenticated','phase12-active@example.test','test','{"handle":"phase12_active"}'::jsonb),
  ('71200000-0000-0000-0000-000000000003','authenticated','authenticated','phase12-inactive@example.test','test','{"handle":"phase12_inactive"}'::jsonb)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status,age_verified_at)
values
  ('71200000-0000-0000-0000-000000000001','phase12_client','Phase 12 Client','active',now()),
  ('71200000-0000-0000-0000-000000000002','phase12_active','Phase 12 Active','active',now()),
  ('71200000-0000-0000-0000-000000000003','phase12_inactive','Phase 12 Inactive','inactive',now())
on conflict(id) do update
set status=excluded.status, age_verified_at=excluded.age_verified_at;

insert into public.channels(owner_id,handle,display_name,bio,city,bairro,province,is_seed)
values
  ('71200000-0000-0000-0000-000000000002','p12active','Active Maputo','Active creator','Maputo','Centro','Maputo',false),
  ('71200000-0000-0000-0000-000000000002','p12matola','Active Matola','Second creator channel','Matola','Liberdade','Maputo',false),
  ('71200000-0000-0000-0000-000000000002','p12seed','Seed channel','Should never leak','Maputo','Centro','Maputo',true),
  ('71200000-0000-0000-0000-000000000003','p12inactive','Inactive owner','Should never leak','Maputo','Centro','Maputo',false)
on conflict (handle) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','71200000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71200000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aal','aal1'
)::text,true);
select set_config('app.internal_write','off',true);

select is(
  (select count(*) from public.discover_channels(null,null,null,null,100,0)),
  2::bigint,
  'only active non-seed channels are discoverable'
);

select is(
  (select count(*) from public.discover_channels(null,'Maputo',null,null,100,0)),
  1::bigint,
  'city filter is server-side'
);

select is(
  (select count(*) from public.discover_channels(null,null,'Liberdade',null,100,0)),
  1::bigint,
  'bairro filter is server-side'
);

select is(
  (select count(*) from public.discover_channels('p12active',null,null,null,100,0)),
  1::bigint,
  'handle search is server-side'
);

select is(
  (select count(*) from public.discover_channels('phase 12 inactive',null,null,null,100,0)),
  0::bigint,
  'inactive owners are excluded'
);

select is(
  (select count(*) from public.discover_channels('p12seed',null,null,null,100,0)),
  0::bigint,
  'seed channels are excluded'
);

select is(
  (select count(*) from public.discover_channels(null,'Maputo', 'Centro', 'Maputo',100,0)),
  1::bigint,
  'combined location filters are enforced'
);

select is(
  (select is_following from public.discover_channels('p12active',null,null,null,100,0) limit 1),
  false,
  'follow state starts false'
);

select lives_ok($$
  select public.follow_channel(
    (select id from public.channels where handle='p12active')
  )
$$,'follow RPC works');

select is(
  (select is_following from public.discover_channels('p12active',null,null,null,100,0) limit 1),
  true,
  'follow state changes without reload'
);

select is(
  (select follower_count from public.discover_channels('p12active',null,null,null,100,0) limit 1),
  1::bigint,
  'follower count is real'
);

select lives_ok($$
  select public.unfollow_channel(
    (select id from public.channels where handle='p12active')
  )
$$,'unfollow RPC works');

select is(
  (select is_following from public.discover_channels('p12active',null,null,null,100,0) limit 1),
  false,
  'unfollow state changes without reload'
);

select is(
  (select follower_count from public.discover_channels('p12active',null,null,null,100,0) limit 1),
  0::bigint,
  'follower count returns to real value'
);

select * from finish();
rollback;
