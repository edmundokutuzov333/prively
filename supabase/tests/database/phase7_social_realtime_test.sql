begin;

with checks as (
  select 1 id, 'tables' name,
    to_regclass('public.comments') is not null
    and to_regclass('public.reactions') is not null
    and to_regclass('public.message_locked_content') is not null
    and to_regclass('public.message_unlocks') is not null
    and to_regclass('public.message_attachments') is not null
    and to_regclass('public.message_translations') is not null
    and to_regclass('public.push_subscriptions') is not null ok
  union all select 2, 'rls',
    (select relrowsecurity from pg_class where oid='public.comments'::regclass)
    and (select relrowsecurity from pg_class where oid='public.reactions'::regclass)
    and (select relrowsecurity from pg_class where oid='public.conversations'::regclass)
    and (select relrowsecurity from pg_class where oid='public.conversation_members'::regclass)
    and (select relrowsecurity from pg_class where oid='public.messages'::regclass)
    and (select relrowsecurity from pg_class where oid='public.notifications'::regclass)
    and (select relrowsecurity from pg_class where oid='public.chat_rate_limits'::regclass)
  union all select 3, 'message membership',
    exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_member' and qual ilike '%conversation_members%')
  union all select 4, 'no tautology',
    not exists(select 1 from pg_policies
      where schemaname='public'
        and tablename='messages'
        and policyname='messages_member'
        and coalesce(qual,'') ilike '%cm.conversation_id = messages.conversation_id%'
        and coalesce(qual,'') ilike '%cm.user_id%')
  union all select 5, 'no generic admin private comm',
    not exists(select 1 from pg_policies where schemaname='public' and tablename in ('messages','conversations','conversation_members','notifications') and policyname in ('admin_read_all','admin_manage_all'))
  union all select 6, 'rate limits private',
    not has_table_privilege('anon','public.chat_rate_limits','SELECT')
    and not has_table_privilege('authenticated','public.chat_rate_limits','SELECT')
    and not has_table_privilege('authenticated','public.chat_rate_limits','UPDATE')
  union all select 7, 'auth bound view',
    has_function_privilege('authenticated','public.can_view_post(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.can_view_post(uuid,uuid)','EXECUTE')
  union all select 8, 'chat rpc grants',
    has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid,text)','EXECUTE')
    and has_function_privilege('authenticated','public.mark_message_read(uuid)','EXECUTE')
    and has_function_privilege('authenticated','public.unlock_message(uuid,text)','EXECUTE')
  union all select 9, 'money internal',
    not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE')
    and not has_function_privilege('authenticated','public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)','EXECUTE')
  union all select 10, 'conversation contracts',
    to_regprocedure('public.create_conversation(uuid)') is not null
    and to_regprocedure('public.create_locked_message(uuid,text,bigint,text)') is not null
    and to_regprocedure('public.mark_conversation_read(uuid)') is not null
  union all select 11, 'social contracts',
    to_regprocedure('public.follow_channel(uuid)') is not null
    and to_regprocedure('public.unfollow_channel(uuid)') is not null
    and to_regprocedure('public.block_user(uuid)') is not null
    and to_regprocedure('public.hide_channel(uuid)') is not null
  union all select 12, 'interaction contracts',
    to_regprocedure('public.add_comment(uuid,text,uuid)') is not null
    and to_regprocedure('public.toggle_reaction(uuid,text)') is not null
    and to_regprocedure('public.add_wishlist(uuid)') is not null
  union all select 13, 'poll constraint',
    exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_pkey')
    and not exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_unique_user')
  union all select 14, 'duplicate message index absent',
    not exists(select 1 from pg_indexes where schemaname='public' and tablename='messages' and indexname='messages_conversation_created_idx')
  union all select 15, 'realtime publication',
    exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages')
    and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications')
    and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='call_sessions')
  union all select 16, 'topics',
    to_regprocedure('public.realtime_conversation_id(text)') is not null
    and public.realtime_conversation_id('conv:00000000-0000-0000-0000-000000000000') is not null
    and public.realtime_conversation_id('typing:00000000-0000-0000-0000-000000000000') is not null
  union all select 17, 'call lifecycle',
    to_regprocedure('public.start_call(uuid,text,text)') is not null
    and to_regprocedure('public.heartbeat_call(uuid)') is not null
    and to_regprocedure('public.end_call(uuid,text)') is not null
    and to_regprocedure('public.bill_active_calls()') is not null
  union all select 18, 'worker only billing',
    has_function_privilege('service_role','public.bill_active_calls()','EXECUTE')
    and not has_function_privilege('authenticated','public.bill_active_calls()','EXECUTE')
  union all select 19, 'live contracts',
    to_regprocedure('public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid)') is not null
    and to_regprocedure('public.heartbeat_live(uuid)') is not null
    and to_regprocedure('public.end_live(uuid,text)') is not null
  union all select 20, 'heartbeat fields',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='private_client_id')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='per_minute_price')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='call_sessions' and column_name='last_heartbeat_at')
  union all select 21, 'flags',
    exists(select 1 from public.platform_settings where key='feature_flags.messaging' and value='true'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.push' and value='false'::jsonb)
    and exists(select 1 from public.platform_settings where key='feature_flags.translation' and value='false'::jsonb)
  union all select 22, 'internal oracles',
    not has_function_privilege('authenticated','public.is_blocked(uuid,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.is_hidden_from(uuid,uuid)','EXECUTE')
  union all select 23, 'push delivery',
    exists(select 1 from pg_indexes where schemaname='public' and tablename='notifications' and indexname='notifications_push_pending_idx')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='push_delivered_at')
  union all select 24, 'private chat bucket',
    exists(select 1 from storage.buckets where id='prively-chat' and public=false)
)
select id,name,ok
from checks
order by id;

do $phase7_test$
declare
  failed integer;
begin
  with checks as (
    select 1 id,
      to_regclass('public.comments') is not null
      and to_regclass('public.reactions') is not null
      and to_regclass('public.message_locked_content') is not null
      and to_regclass('public.message_unlocks') is not null
      and to_regclass('public.message_attachments') is not null
      and to_regclass('public.message_translations') is not null
      and to_regclass('public.push_subscriptions') is not null ok
    union all select 2,
      (select relrowsecurity from pg_class where oid='public.comments'::regclass)
      and (select relrowsecurity from pg_class where oid='public.reactions'::regclass)
      and (select relrowsecurity from pg_class where oid='public.conversations'::regclass)
      and (select relrowsecurity from pg_class where oid='public.conversation_members'::regclass)
      and (select relrowsecurity from pg_class where oid='public.messages'::regclass)
      and (select relrowsecurity from pg_class where oid='public.notifications'::regclass)
      and (select relrowsecurity from pg_class where oid='public.chat_rate_limits'::regclass)
    union all select 3, exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_member' and qual ilike '%conversation_members%')
    union all select 4, not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and coalesce(qual,'') ilike '%m.conversation_id = m.conversation_id%')
    union all select 5, not exists(select 1 from pg_policies where schemaname='public' and tablename in ('messages','conversations','conversation_members','notifications') and policyname in ('admin_read_all','admin_manage_all'))
    union all select 6, not has_table_privilege('anon','public.chat_rate_limits','SELECT') and not has_table_privilege('authenticated','public.chat_rate_limits','SELECT') and not has_table_privilege('authenticated','public.chat_rate_limits','UPDATE')
    union all select 7, has_function_privilege('authenticated','public.can_view_post(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.can_view_post(uuid,uuid)','EXECUTE')
    union all select 8, has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid,text)','EXECUTE') and has_function_privilege('authenticated','public.mark_message_read(uuid)','EXECUTE') and has_function_privilege('authenticated','public.unlock_message(uuid,text)','EXECUTE')
    union all select 9, not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE') and not has_function_privilege('authenticated','public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)','EXECUTE')
    union all select 10, to_regprocedure('public.create_conversation(uuid)') is not null and to_regprocedure('public.create_locked_message(uuid,text,bigint,text)') is not null and to_regprocedure('public.mark_conversation_read(uuid)') is not null
    union all select 11, to_regprocedure('public.follow_channel(uuid)') is not null and to_regprocedure('public.unfollow_channel(uuid)') is not null and to_regprocedure('public.block_user(uuid)') is not null and to_regprocedure('public.hide_channel(uuid)') is not null
    union all select 12, to_regprocedure('public.add_comment(uuid,text,uuid)') is not null and to_regprocedure('public.toggle_reaction(uuid,text)') is not null and to_regprocedure('public.add_wishlist(uuid)') is not null
    union all select 13, exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_pkey') and not exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_unique_user')
    union all select 14, not exists(select 1 from pg_indexes where schemaname='public' and tablename='messages' and indexname='messages_conversation_created_idx')
    union all select 15, exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='call_sessions')
    union all select 16, to_regprocedure('public.realtime_conversation_id(text)') is not null and public.realtime_conversation_id('conv:00000000-0000-0000-0000-000000000000') is not null and public.realtime_conversation_id('typing:00000000-0000-0000-0000-000000000000') is not null
    union all select 17, to_regprocedure('public.start_call(uuid,text,text)') is not null and to_regprocedure('public.heartbeat_call(uuid)') is not null and to_regprocedure('public.end_call(uuid,text)') is not null and to_regprocedure('public.bill_active_calls()') is not null
    union all select 18, has_function_privilege('service_role','public.bill_active_calls()','EXECUTE') and not has_function_privilege('authenticated','public.bill_active_calls()','EXECUTE')
    union all select 19, to_regprocedure('public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid)') is not null and to_regprocedure('public.heartbeat_live(uuid)') is not null and to_regprocedure('public.end_live(uuid,text)') is not null
    union all select 20, exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='private_client_id') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='per_minute_price') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='call_sessions' and column_name='last_heartbeat_at')
    union all select 21, exists(select 1 from public.platform_settings where key='feature_flags.messaging' and value='true'::jsonb) and exists(select 1 from public.platform_settings where key='feature_flags.push' and value='false'::jsonb) and exists(select 1 from public.platform_settings where key='feature_flags.translation' and value='false'::jsonb)
    union all select 22, not has_function_privilege('authenticated','public.is_blocked(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.is_hidden_from(uuid,uuid)','EXECUTE')
    union all select 23, exists(select 1 from pg_indexes where schemaname='public' and tablename='notifications' and indexname='notifications_push_pending_idx') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='push_delivered_at')
    union all select 24, exists(select 1 from storage.buckets where id='prively-chat' and public=false)
  )
  select count(*) into failed from checks where not ok;
  if failed > 0 then
    raise exception 'Phase 7 regression checks failed: % criterion(s)', failed;
  end if;
end;
$phase7_test$;

rollback;
