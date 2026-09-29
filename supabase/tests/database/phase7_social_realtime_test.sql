begin;

select plan(24);

select ok(
  to_regclass('public.comments') is not null
  and to_regclass('public.reactions') is not null
  and to_regclass('public.message_locked_content') is not null
  and to_regclass('public.message_unlocks') is not null
  and to_regclass('public.message_attachments') is not null
  and to_regclass('public.message_translations') is not null
  and to_regclass('public.push_subscriptions') is not null,
  'Phase 7 social and communication tables exist'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.comments'::regclass)
  and (select relrowsecurity from pg_class where oid='public.reactions'::regclass)
  and (select relrowsecurity from pg_class where oid='public.conversations'::regclass)
  and (select relrowsecurity from pg_class where oid='public.conversation_members'::regclass)
  and (select relrowsecurity from pg_class where oid='public.messages'::regclass)
  and (select relrowsecurity from pg_class where oid='public.notifications'::regclass)
  and (select relrowsecurity from pg_class where oid='public.chat_rate_limits'::regclass),
  'Phase 7 tables have RLS enabled'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='messages'
      and policyname='messages_member'
      and qual ilike '%conversation_members%'
  ),
  'message reads are tied to conversation membership'
);

select ok(
  not exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='messages'
      and coalesce(qual,'') ilike '%m.conversation_id = m.conversation_id%'
  ),
  'tautological message RLS condition is absent'
);

select ok(
  not exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('messages','conversations','conversation_members','notifications')
      and policyname in ('admin_read_all','admin_manage_all')
  ),
  'ordinary admin policies do not expose private communications'
);

select ok(
  not has_table_privilege('anon','public.chat_rate_limits','SELECT')
  and not has_table_privilege('authenticated','public.chat_rate_limits','SELECT')
  and not has_table_privilege('authenticated','public.chat_rate_limits','UPDATE'),
  'rate-limit state is not client-readable or writable'
);

select ok(
  has_function_privilege('authenticated','public.can_view_post(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.can_view_post(uuid,uuid)','EXECUTE'),
  'client receives only the auth-bound post access check'
);

select ok(
  has_function_privilege('authenticated','public.send_message_v2(uuid,text,text,uuid,text)','EXECUTE')
  and has_function_privilege('authenticated','public.mark_message_read(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.unlock_message(uuid,text)','EXECUTE'),
  'chat mutation contracts are exposed through guarded RPCs'
);

select ok(
  not has_function_privilege('authenticated','public.credit_topup(text,text,bigint,text)','EXECUTE')
  and not has_function_privilege('authenticated','public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)','EXECUTE'),
  'trusted money primitives remain internal'
);

select ok(
  to_regprocedure('public.create_conversation(uuid)') is not null
  and to_regprocedure('public.create_locked_message(uuid,text,bigint,text)') is not null
  and to_regprocedure('public.mark_conversation_read(uuid)') is not null,
  'conversation lifecycle contracts exist'
);

select ok(
  to_regprocedure('public.follow_channel(uuid)') is not null
  and to_regprocedure('public.unfollow_channel(uuid)') is not null
  and to_regprocedure('public.block_user(uuid)') is not null
  and to_regprocedure('public.hide_channel(uuid)') is not null,
  'social graph mutation contracts exist'
);

select ok(
  to_regprocedure('public.add_comment(uuid,text,uuid)') is not null
  and to_regprocedure('public.toggle_reaction(uuid,text)') is not null
  and to_regprocedure('public.add_wishlist(uuid)') is not null,
  'interaction contracts exist'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_pkey')
  and not exists(select 1 from pg_constraint where conrelid='public.poll_votes'::regclass and conname='poll_votes_unique_user'),
  'poll votes are unique without duplicate constraints'
);

select ok(
  not exists(
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='messages'
      and indexname='messages_conversation_created_idx'
  ),
  'duplicate message index removed'
);

select ok(
  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages')
  and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications')
  and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='call_sessions'),
  'Realtime publication includes communication tables'
);

select ok(
  to_regprocedure('public.realtime_conversation_id(text)') is not null
  and public.realtime_conversation_id('conv:00000000-0000-0000-0000-000000000000') is not null
  and public.realtime_conversation_id('typing:00000000-0000-0000-0000-000000000000') is not null,
  'conversation and typing topics resolve server-side'
);

select ok(
  to_regprocedure('public.start_call(uuid,text,text)') is not null
  and to_regprocedure('public.heartbeat_call(uuid)') is not null
  and to_regprocedure('public.end_call(uuid,text)') is not null
  and to_regprocedure('public.bill_active_calls()') is not null,
  'paid call lifecycle contracts exist'
);

select ok(
  has_function_privilege('service_role','public.bill_active_calls()','EXECUTE')
  and not has_function_privilege('authenticated','public.bill_active_calls()','EXECUTE'),
  'call billing executes only in the trusted worker context'
);

select ok(
  to_regprocedure('public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid)') is not null
  and to_regprocedure('public.heartbeat_live(uuid)') is not null
  and to_regprocedure('public.end_live(uuid,text)') is not null,
  'live session contracts exist'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='private_client_id')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_sessions' and column_name='per_minute_price')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='call_sessions' and column_name='last_heartbeat_at'),
  'private live and call heartbeat fields exist'
);

select ok(
  exists(select 1 from public.platform_settings where key='feature_flags.messaging' and value=true)
  and exists(select 1 from public.platform_settings where key='feature_flags.push' and value=false)
  and exists(select 1 from public.platform_settings where key='feature_flags.translation' and value=false),
  'Phase 7 production feature flags reflect configured integrations'
);

select ok(
  not has_function_privilege('authenticated','public.is_blocked(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.is_hidden_from(uuid,uuid)','EXECUTE'),
  'block and hidden-user oracles remain internal'
);

select ok(
  exists(select 1 from pg_indexes where schemaname='public' and tablename='notifications' and indexname='notifications_push_pending_idx')
  and exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='push_delivered_at'),
  'push delivery state is persisted and indexed'
);

select ok(
  exists(select 1 from storage.buckets where id='prively-chat' and public=false),
  'chat media bucket is private'
);

select * from finish();
rollback;