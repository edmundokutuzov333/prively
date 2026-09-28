-- Prively Phase 7 hardening: security and performance after live audit.

alter table public.chat_rate_limits enable row level security;
revoke all on public.chat_rate_limits from anon,authenticated;

drop index if exists public.messages_conversation_created_idx;
alter table public.poll_votes drop constraint if exists poll_votes_unique_user;

grant select on public.comments,public.reactions to authenticated;
grant select on public.message_locked_content to authenticated;

comment on table public.chat_rate_limits is
  'Internal server-side rate-limit state. Browser roles have no table privileges; access occurs only through SECURITY DEFINER mutation functions.';

