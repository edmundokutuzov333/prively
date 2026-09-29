-- Phase 7 relation indexes: cover new social, communication, push, live and safety foreign keys.

create index if not exists comments_user_idx on public.comments(user_id);
create index if not exists comments_parent_idx on public.comments(parent_id);
create index if not exists reactions_user_idx on public.reactions(user_id);

create index if not exists follows_channel_idx on public.follows(channel_id);
create index if not exists blocks_blocked_user_idx on public.blocks(blocked_user_id);
create index if not exists hidden_from_user_idx on public.hidden_from(user_id);

create index if not exists conversations_channel_idx on public.conversations(channel_id);
create index if not exists conversations_creator_idx on public.conversations(creator_id);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);

create index if not exists message_locked_content_message_idx on public.message_locked_content(message_id);
create index if not exists message_unlocks_message_idx on public.message_unlocks(message_id);
create index if not exists message_unlocks_user_idx on public.message_unlocks(user_id);

create index if not exists message_attachments_conversation_idx on public.message_attachments(conversation_id);
create index if not exists message_attachments_owner_idx on public.message_attachments(owner_id);


create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create index if not exists call_sessions_channel_idx on public.call_sessions(channel_id);
create index if not exists call_sessions_client_idx on public.call_sessions(client_id);

create index if not exists live_sessions_channel_idx on public.live_sessions(channel_id);
create index if not exists live_sessions_private_client_idx on public.live_sessions(private_client_id);

create index if not exists chat_rate_limits_window_idx on public.chat_rate_limits(window_started_at);
