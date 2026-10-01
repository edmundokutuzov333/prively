begin;

with checks as (
  select 1 id, 'chat tables present' name,
    to_regclass('public.conversations') is not null
    and to_regclass('public.conversation_members') is not null
    and to_regclass('public.blocks') is not null
    and to_regclass('public.messages') is not null
    and to_regclass('public.message_attachments') is not null
    and to_regclass('public.message_locked_content') is not null ok
  union all
  select 2, 'rls enabled',
    (select relrowsecurity from pg_class where oid='public.conversations'::regclass)
    and (select relrowsecurity from pg_class where oid='public.conversation_members'::regclass)
    and (select relrowsecurity from pg_class where oid='public.blocks'::regclass)
    and (select relrowsecurity from pg_class where oid='public.messages'::regclass)
    and (select relrowsecurity from pg_class where oid='public.message_attachments'::regclass)
    and (select relrowsecurity from pg_class where oid='public.message_locked_content'::regclass)
  union all
  select 3, 'blocks owner only',
    exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='blocks' and policyname='blocks_owner_all'
        and qual ilike '%auth.uid()%' and with_check ilike '%auth.uid()%'
    )
    and not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='blocks'
        and policyname in ('admin_read_all','admin_manage_all')
    )
  union all
  select 4, 'messages membership plus block boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='messages' and policyname='messages_member'
        and qual ilike '%conversation_members%' and qual ilike '%blocks%'
    )
  union all
  select 5, 'attachment privacy boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='message_attachments'
        and policyname='message_attachments_member_read'
        and qual ilike '%conversation_members%' and qual ilike '%blocks%'
    )
  union all
  select 6, 'locked body privacy boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='message_locked_content'
        and policyname='locked_content_member_read'
        and qual ilike '%conversation_members%' and qual ilike '%blocks%'
    )
  union all
  select 7, 'guarded create conversation',
    has_function_privilege('authenticated','public.create_conversation(uuid)','EXECUTE')
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%dm_closed%'
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%blocked%'
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%subscription_required%'
  union all
  select 8, 'guarded message RPC',
    has_function_privilege('authenticated','public.send_message_guarded(uuid,text,text,uuid,text)','EXECUTE')
    and has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid,text)','EXECUTE')
    and not has_function_privilege('authenticated','public.send_message(uuid,text)','EXECUTE')
  union all
  select 9, 'realtime message publication',
    exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
    )
  union all
  select 10, 'private chat storage',
    exists (
      select 1 from storage.buckets
      where id='prively-chat' and public=false
    )
  union all
  select 11, 'communication privacy acceptance',
    to_regprocedure('public.accept_communication_privacy(text,text)') is not null
)
select id,name,ok from checks order by id;

do $phase11_test$
declare
  u1 uuid;
  u2 uuid;
  u3 uuid;
  channel_id uuid;
  off_channel_id uuid;
  subscriber_channel_id uuid;
  conversation_id uuid;
  privacy_version text;
  participant_visible integer;
  nonparticipant_visible integer;
  blocked boolean := false;
  dm_closed boolean := false;
  subscription_required boolean := false;
  post_block_message_count integer;
begin
  select p.id into u1 from public.profiles p order by p.created_at limit 1;
  select p.id into u2 from public.profiles p where p.id <> u1 order by p.created_at limit 1;
  select p.id into u3 from public.profiles p where p.id not in (u1,u2) order by p.created_at limit 1;

  if u1 is null or u2 is null or u3 is null then
    raise exception 'phase11_requires_three_profiles';
  end if;

  perform set_config('app.internal_write','on',true);

  update public.profiles
  set age_verified_at = coalesce(age_verified_at, now()), status = 'active'
  where id in (u1,u2,u3);

  select coalesce(value #>> '{}','1.0')
    into privacy_version
  from public.platform_settings
  where key='legal.communication_privacy_version';

  insert into public.channels(owner_id, handle, display_name, dm_mode, is_seed)
  values (
    u2,
    ('p11' || substr(replace(gen_random_uuid()::text,'-',''),1,18))::citext,
    'Phase 11 Test Channel',
    'free',
    true
  )
  returning id into channel_id;

  insert into public.channels(owner_id, handle, display_name, dm_mode, is_seed)
  values (
    u2,
    ('p11' || substr(replace(gen_random_uuid()::text,'-',''),1,18))::citext,
    'Phase 11 Off Channel',
    'off',
    true
  )
  returning id into off_channel_id;

  insert into public.channels(owner_id, handle, display_name, dm_mode, is_seed)
  values (
    u2,
    ('p11' || substr(replace(gen_random_uuid()::text,'-',''),1,18))::citext,
    'Phase 11 Subscriber Channel',
    'subscribers',
    true
  )
  returning id into subscriber_channel_id;

  perform set_config('request.jwt.claim.sub',u1::text,true);
  perform public.accept_communication_privacy('conversation',privacy_version);

  insert into public.conversations(client_id,creator_id,channel_id)
  values(u1,u2,channel_id)
  returning id into conversation_id;

  insert into public.conversation_members(conversation_id,user_id)
  values(conversation_id,u1),(conversation_id,u2)
  on conflict do nothing;

  insert into public.messages(conversation_id,sender_id,kind,body)
  values(conversation_id,u1,'text','phase11 realtime isolation probe');

  set local role authenticated;

  perform set_config('request.jwt.claim.sub',u1::text,true);

  begin
    perform public.create_conversation(off_channel_id);
  exception when others then
    dm_closed := sqlerrm ilike '%dm_closed%';
  end;

  begin
    perform public.create_conversation(subscriber_channel_id);
  exception when others then
    subscription_required := sqlerrm ilike '%subscription_required%';
  end;

  select count(*) into participant_visible
  from public.messages m
  where m.conversation_id=conversation_id;

  perform set_config('request.jwt.claim.sub',u3::text,true);

  select count(*) into nonparticipant_visible
  from public.messages
  where conversation_id=conversation_id;

  reset role;

  insert into public.blocks(owner_id,blocked_user_id)
  values(u2,u1);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',u1::text,true);

  begin
    perform public.send_message_guarded(
      conversation_id,'blocked direct rpc probe','text',null,
      'phase11-test-' || gen_random_uuid()::text
    );
  exception when others then
    blocked := sqlerrm ilike '%user_blocked%' or sqlerrm ilike '%blocked%';
  end;

  reset role;

  select count(*) into post_block_message_count
  from public.messages
  where conversation_id=conversation_id;

  if not dm_closed then
    raise exception 'dm_off_not_enforced';
  end if;
  if not subscription_required then
    raise exception 'dm_subscriber_gate_not_enforced';
  end if;
  if participant_visible <> 1 then
    raise exception 'participant_cannot_read_message';
  end if;
  if nonparticipant_visible <> 0 then
    raise exception 'nonparticipant_can_read_message';
  end if;
  if not blocked then
    raise exception 'blocked_user_message_insert_was_not_rejected';
  end if;
  if post_block_message_count <> 1 then
    raise exception 'blocked_rpc_created_message';
  end if;
end;
$phase11_test$;

rollback;
