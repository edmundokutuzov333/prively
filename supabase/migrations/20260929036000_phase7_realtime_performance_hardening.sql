-- Phase 7 performance hardening.
-- Avoid per-row auth re-evaluation in social, messaging, presence and calls.
-- Add covering indexes for Phase 7 foreign keys.

do $phase7$
declare
  r record;
  q text;
  w text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where (schemaname='realtime' and tablename='messages' and policyname in ('prively_conv_receive','prively_conv_send'))
       or (schemaname='public' and tablename='follows' and policyname='follows_read_own_or_owner')
       or (schemaname='public' and tablename='blocks' and policyname='blocks_read_own')
       or (schemaname='public' and tablename='hidden_from' and policyname='hidden_owner_read')
       or (schemaname='public' and tablename='wishlist' and policyname='wishlist_own')
       or (schemaname='public' and tablename='live_sessions' and policyname='live_read')
       or (schemaname='public' and tablename='call_sessions' and policyname='call_parties')
       or (schemaname='public' and tablename='polls' and policyname='polls_read')
       or (schemaname='public' and tablename='poll_options' and policyname='poll_options_read')
       or (schemaname='public' and tablename='poll_votes' and policyname='poll_votes_own')
       or (schemaname='public' and tablename='conversations' and policyname='conversations_parties')
       or (schemaname='public' and tablename='conversation_members' and policyname='conversation_members_own')
       or (schemaname='public' and tablename='messages' and policyname='messages_member')
       or (schemaname='public' and tablename='notifications' and policyname='notifications_own')
       or (schemaname='public' and tablename='reactions' and policyname='reactions_read_allowed')
       or (schemaname='public' and tablename='message_locked_content' and policyname='locked_content_member_read')
       or (schemaname='public' and tablename='message_unlocks' and policyname='message_unlocks_own_read')
       or (schemaname='public' and tablename='message_attachments' and policyname='message_attachments_member_read')
       or (schemaname='public' and tablename='message_translations' and policyname='message_translations_member_read')
       or (schemaname='public' and tablename='push_subscriptions' and policyname='push_subscriptions_own')
  loop
    q := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    q := replace(q, '(select (select auth.uid()))', '(select auth.uid())');
    q := replace(q, 'auth.role()', '(select auth.role())');
    q := replace(q, '(select (select auth.role()))', '(select auth.role())');

    w := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    w := replace(w, '(select (select auth.uid()))', '(select auth.uid())');
    w := replace(w, 'auth.role()', '(select auth.role())');
    w := replace(w, '(select (select auth.role()))', '(select auth.role())');

    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, w);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    elsif r.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, w);
    end if;
  end loop;
end;
$phase7$;

drop policy if exists chat_rate_limits_deny_client on public.chat_rate_limits;

create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists poll_options_poll_idx on public.poll_options(poll_id);
create index if not exists poll_votes_option_idx on public.poll_votes(option_id);
create index if not exists poll_votes_user_idx on public.poll_votes(user_id);
create index if not exists polls_channel_idx on public.polls(channel_id);
create index if not exists wishlist_post_idx on public.wishlist(post_id);
