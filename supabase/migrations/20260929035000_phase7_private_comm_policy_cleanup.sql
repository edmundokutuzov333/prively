-- Phase 7 privacy boundary cleanup.
-- Private communications are never exposed through generic admin RLS.
-- Team access to private content is reserved for the dedicated Compliance View
-- and must be audited according to the platform specification.

do $phase7$
declare
  t text;
begin
  foreach t in array ARRAY[
    'messages',
    'conversations',
    'conversation_members',
    'notifications',
    'message_attachments',
    'message_locked_content',
    'message_translations',
    'message_unlocks',
    'call_sessions',
    'live_sessions',
    'push_subscriptions'
  ]
  loop
    execute format('drop policy if exists admin_manage_all on public.%I', t);
    execute format('drop policy if exists admin_read_all on public.%I', t);
  end loop;
end;
$phase7$;

drop index if exists public.message_attachments_message_idx2;
drop index if exists public.message_translations_message_idx2;
