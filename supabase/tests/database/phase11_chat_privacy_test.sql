begin;
select plan(27);

select ok(to_regclass('public.conversations') is not null, 'conversations exists');
select ok(to_regclass('public.conversation_members') is not null, 'conversation_members exists');
select ok(to_regclass('public.blocks') is not null, 'blocks exists');
select ok(to_regclass('public.messages') is not null, 'messages exists');
select ok(to_regclass('public.message_attachments') is not null, 'message_attachments exists');
select ok(to_regclass('public.message_locked_content') is not null, 'message_locked_content exists');
select ok((select relrowsecurity from pg_class where oid='public.blocks'::regclass), 'blocks RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.messages'::regclass), 'messages RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.message_attachments'::regclass), 'attachments RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.message_locked_content'::regclass), 'locked content RLS enabled');
select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='blocks'
    and policyname='blocks_owner_all'
), 'blocks owner policy exists');
select ok(not exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='blocks'
    and policyname in ('admin_read_all','admin_manage_all')
), 'blocks generic admin policies absent');
select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='messages'
    and policyname='messages_member'
    and qual ilike '%conversation_members%'
    and qual ilike '%blocks%'
), 'messages membership and block boundary exists');
select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='message_attachments'
    and policyname='message_attachments_member_read'
    and qual ilike '%conversation_members%'
    and qual ilike '%blocks%'
), 'attachment privacy boundary exists');
select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='message_locked_content'
    and policyname='locked_content_member_read'
    and qual ilike '%conversation_members%'
    and qual ilike '%blocks%'
), 'locked content privacy boundary exists');
select ok(has_function_privilege('authenticated','public.send_message_guarded(uuid,text,text,uuid,text)','EXECUTE'),'guarded send RPC granted');
select ok(not has_function_privilege('authenticated','public.send_message(uuid,text)','EXECUTE'),'legacy send RPC revoked');
select ok(exists(
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
), 'messages in Realtime publication');
select ok(exists(
  select 1 from storage.buckets where id='prively-chat' and public=false
), 'private chat bucket');

select set_config('app.internal_write','on',true);

insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data)
values
  ('71100000-0000-0000-0000-000000000001','authenticated','authenticated','phase11-client@example.test','test','{"handle":"phase11_client"}'::jsonb),
  ('71100000-0000-0000-0000-000000000002','authenticated','authenticated','phase11-creator@example.test','test','{"handle":"phase11_creator"}'::jsonb),
  ('71100000-0000-0000-0000-000000000003','authenticated','authenticated','phase11-outsider@example.test','test','{"handle":"phase11_outsider"}'::jsonb)
on conflict(id) do nothing;

insert into public.profiles(id,handle,display_name,status)
values
  ('71100000-0000-0000-0000-000000000001','phase11_client','Phase 11 Client','active'),
  ('71100000-0000-0000-0000-000000000002','phase11_creator','Phase 11 Creator','active'),
  ('71100000-0000-0000-0000-000000000003','phase11_outsider','Phase 11 Outsider','active')
on conflict(id) do nothing;

update public.profiles
set age_verified_at=now(),status='active'
where id in (
  '71100000-0000-0000-0000-000000000001',
  '71100000-0000-0000-0000-000000000002',
  '71100000-0000-0000-0000-000000000003'
);

insert into public.kyc_verifications(user_id,provider,status,reviewed_at)
values
  ('71100000-0000-0000-0000-000000000001','manual','approved',now()),
  ('71100000-0000-0000-0000-000000000002','manual','approved',now()),
  ('71100000-0000-0000-0000-000000000003','manual','approved',now())
on conflict do nothing;

insert into public.channels(owner_id,handle,display_name,dm_mode,is_seed)
values
  ('71100000-0000-0000-0000-000000000002','p11free_7110000001','Phase 11 Free','free',true),
  ('71100000-0000-0000-0000-000000000002','p11off_7110000001','Phase 11 Off','off',true),
  ('71100000-0000-0000-0000-000000000002','p11subs_7110000001','Phase 11 Subscribers','subscribers',true)
on conflict (handle) do nothing;

select set_config('request.jwt.claim.sub','71100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71100000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aal','aal1'
)::text,true);
select public.accept_communication_privacy(
  'conversation',
  coalesce((select value #>> '{}' from public.platform_settings where key='legal.communication_privacy_version'),'1.0')
);

set local role authenticated;
select set_config('app.internal_write','off',true);

select ok(has_function_privilege('authenticated','public.create_conversation(uuid)','EXECUTE'),'authenticated can execute create conversation');

set local role service_role;
select ok(
  public.create_conversation(
    (select id from public.channels where handle='p11free_7110000001')
  ) is not null,
  'participant can create free conversation'
);

set local role service_role;
insert into public.messages(conversation_id,sender_id,kind,body)
values(
  (select id from public.conversations
   where channel_id=(select id from public.channels where handle='p11free_7110000001')
     and client_id='71100000-0000-0000-0000-000000000001'),
  '71100000-0000-0000-0000-000000000001',
  'text',
  'phase11 participant read probe'
);
set local role authenticated;

select is((
  select count(*)
  from public.messages
  where conversation_id=(
    select id from public.conversations
    where channel_id=(select id from public.channels where handle='p11free_7110000001')
      and client_id='71100000-0000-0000-0000-000000000001'
  )
),1::bigint,'participant reads conversation messages');

select throws_ok($$
  select public.create_conversation(
    (select id from public.channels where handle='p11off_7110000001')
  )
$$,'dm_closed','DM off is enforced');

select throws_ok($$
  select public.create_conversation(
    (select id from public.channels where handle='p11subs_7110000001')
  )
$$,'subscription_required','subscriber DM requires active subscription');

select set_config('request.jwt.claim.sub','71100000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71100000-0000-0000-0000-000000000003',
  'role','authenticated',
  'aal','aal1'
)::text,true);

select is((
  select count(*)
  from public.messages
  where conversation_id=(
    select id from public.conversations
    where channel_id=(select id from public.channels where handle='p11free_7110000001')
      and client_id='71100000-0000-0000-0000-000000000001'
  )
),0::bigint,'nonparticipant reads no messages');

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','71100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71100000-0000-0000-0000-000000000001',
  'role','service_role'
)::text,true);

select public.accept_communication_privacy(
  'conversation',
  coalesce((select value #>> '{}' from public.platform_settings where key='legal.communication_privacy_version'),'1.0')
);

select is((
  select count(*) from public.conversation_members cm
  where cm.conversation_id=(
    select id from public.conversations
    where channel_id=(select id from public.channels where handle='p11free_7110000001')
      and client_id='71100000-0000-0000-0000-000000000001'
  )
),2::bigint,'conversation has exactly two members');

insert into public.blocks(owner_id,blocked_user_id)
values('71100000-0000-0000-0000-000000000002','71100000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','71100000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',json_build_object(
  'sub','71100000-0000-0000-0000-000000000001',
  'role','authenticated',
  'aal','aal1'
)::text,true);

select throws_ok($$
  select public.send_message_guarded(
    (select id from public.conversations
     where channel_id=(select id from public.channels where handle='p11free_7110000001')
       and client_id='71100000-0000-0000-0000-000000000001'),
    'blocked direct rpc probe',
    'text',
    null,
    'phase11-blocked-probe'
  )
$$,'user_blocked','blocked user cannot send through guarded RPC');

reset role;
select is((
  select count(*) from public.messages
  where conversation_id=(
    select id from public.conversations
    where channel_id=(select id from public.channels where handle='p11free_7110000001')
      and client_id='71100000-0000-0000-0000-000000000001'
  )
),1::bigint,'blocked RPC created no extra message');

select * from finish();
rollback;
