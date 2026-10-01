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
      where schemaname='public'
        and tablename='blocks'
        and policyname='blocks_owner_all'
        and qual ilike '%auth.uid()%'
        and with_check ilike '%auth.uid()%'
    )
    and not exists (
      select 1 from pg_policies
      where schemaname='public'
        and tablename='blocks'
        and policyname in ('admin_read_all','admin_manage_all')
    )
  union all
  select 4, 'messages membership plus block boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public'
        and tablename='messages'
        and policyname='messages_member'
        and qual ilike '%conversation_members%'
        and qual ilike '%public.blocks%'
    )
  union all
  select 5, 'attachment privacy boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public'
        and tablename='message_attachments'
        and policyname='message_attachments_member_read'
        and qual ilike '%conversation_members%'
        and qual ilike '%public.blocks%'
    )
  union all
  select 6, 'locked body privacy boundary',
    exists (
      select 1 from pg_policies
      where schemaname='public'
        and tablename='message_locked_content'
        and policyname='locked_content_member_read'
        and qual ilike '%conversation_members%'
        and qual ilike '%public.blocks%'
    )
  union all
  select 7, 'guarded create conversation',
    has_function_privilege('authenticated','public.create_conversation(uuid)','EXECUTE')
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%dm_closed%'
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%blocked%'
    and pg_get_functiondef('public.create_conversation(uuid)'::regprocedure) ilike '%subscription_required%'
  union all
  select 8, 'guarded message RPC',
    has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid,text)','EXECUTE')
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
  channel_id uuid;
  conversation_id uuid;
  blocked boolean := false;
begin
  select p.id into u1 from public.profiles p order by p.created_at limit 1;
  select p.id into u2 from public.profiles p where p.id <> u1 order by p.created_at limit 1;

  if u1 is null or u2 is null then
    raise exception 'phase11_requires_two_profiles';
  end if;

  perform set_config('app.internal_write','on',true);

  update public.profiles
  set age_verified_at = coalesce(age_verified_at, now()), status = 'active'
  where id in (u1,u2);

  insert into public.channels(owner_id, handle, display_name, dm_mode, is_seed)
  values (
    u2,
    ('phase11test_' || substr(replace(gen_random_uuid()::text,'-',''),1,16))::citext,
    'Phase 11 Test Channel',
    'free',
    true
  )
  returning id into channel_id;

  perform set_config('request.jwt.claim.sub',u1::text,true);

  insert into public.conversations(client_id,creator_id,channel_id)
  values(u1,u2,channel_id)
  returning id into conversation_id;

  insert into public.conversation_members(conversation_id,user_id)
  values(conversation_id,u1),(conversation_id,u2)
  on conflict do nothing;

  insert into public.blocks(owner_id,blocked_user_id) values(u2,u1);

  begin
    perform public.send_message_v2(
      conversation_id,'blocked direct rpc probe','text',null,
      'phase11-test-' || gen_random_uuid()::text
    );
  exception
    when others then
      blocked := sqlerrm = 'blocked: blocked' or sqlerrm = 'blocked';
  end;

  if not blocked then
    raise exception 'blocked_user_message_insert_was_not_rejected';
  end if;
end;
$phase11_test$;

rollback;
