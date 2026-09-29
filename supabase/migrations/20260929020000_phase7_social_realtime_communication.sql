-- Prively Phase 7 reconciliation migration.
-- Repairs and exposes the already-built Phase 7 contracts in the remote project.
-- No demo data, no destructive data migration.

-- ---------------------------------------------------------------------------
-- Realtime topic parser and authorization
-- ---------------------------------------------------------------------------

create or replace function public.realtime_conversation_id(_topic text)
returns uuid
language plpgsql
immutable
set search_path=pg_catalog
as $phase7$
declare result uuid;
begin
  if _topic is null or _topic !~ '^(conv|typing):[0-9a-fA-F-]{36}$' then
    return null;
  end if;

  begin
    result:=split_part(_topic,':',2)::uuid;
    return result;
  exception when others then
    return null;
  end;
end;
$phase7$;

revoke all on function public.realtime_conversation_id(text) from public,anon;
grant execute on function public.realtime_conversation_id(text) to authenticated;

drop policy if exists prively_conv_receive on realtime.messages;
create policy prively_conv_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast','presence')
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id=public.realtime_conversation_id(realtime.topic())
      and cm.user_id=auth.uid()
  )
);

drop policy if exists prively_conv_send on realtime.messages;
create policy prively_conv_send
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast','presence')
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id=public.realtime_conversation_id(realtime.topic())
      and cm.user_id=auth.uid()
  )
);


-- The local migration set can be rebuilt from zero. Earlier reconciliation
-- migrations may have been no-op markers, so keep the post visibility
-- authority available before any Phase 7 grants reference it.

create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $phase7_post$
declare
  p public.posts;
  c public.channels;
begin
  if auth.uid() is not null and _uid<>auth.uid() then
    return false;
  end if;

  select * into p
  from public.posts
  where id=_post_id
    and status='published'
    and (publish_at is null or publish_at<=now())
    and (expires_at is null or expires_at>now());

  if not found then
    return false;
  end if;

  select * into c from public.channels where id=p.channel_id;
  if _uid=c.owner_id then
    return true;
  end if;

  if not public.is_age_verified(_uid) then
    return false;
  end if;

  if exists(
    select 1
    from public.media_assets a
    where a.post_id=p.id
      and a.deleted_at is null
      and (
        a.integrity_status<>'verified'
        or a.moderation_status<>'clean'
        or a.scan_status<>'clean'
      )
  ) then
    return false;
  end if;

  if exists(
    select 1
    from public.blocks
    where (owner_id=c.owner_id and blocked_user_id=_uid)
       or (owner_id=_uid and blocked_user_id=c.owner_id)
  ) then
    return false;
  end if;

  if exists(
    select 1
    from public.hidden_from
    where channel_id=c.id and user_id=_uid
  ) then
    return false;
  end if;

  return case p.visibility
    when 'public' then true
    when 'followers' then exists(
      select 1 from public.follows
      where follower_id=_uid and channel_id=c.id
    )
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(
      select 1
      from public.ppv_purchases
      where buyer_id=_uid and post_id=p.id
    )
      or exists(
        select 1
        from public.bundle_purchases bp
        join public.bundle_items bi on bi.bundle_id=bp.bundle_id
        where bp.buyer_id=_uid and bi.post_id=p.id
      )
    else false
  end;
end
$phase7_post$;

create or replace function public.can_view_post(_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $phase7_post_wrapper$
  select public.can_view_post(_post_id, auth.uid());
$phase7_post_wrapper$;

revoke all on function public.can_view_post(uuid,uuid) from public,anon,authenticated;
revoke all on function public.can_view_post(uuid) from public,anon,authenticated;
grant execute on function public.can_view_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Client-safe RPC surface
-- UI mutates through guarded RPCs. Internal helpers remain server-only.
-- ---------------------------------------------------------------------------

create or replace function public.is_blocked(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  select exists(
    select 1
    from public.blocks
    where (owner_id=_a and blocked_user_id=_b)
       or (owner_id=_b and blocked_user_id=_a)
  );
$function$;

create or replace function public.is_hidden_from(_channel uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  select exists(
    select 1
    from public.hidden_from
    where channel_id=_channel and user_id=_user
  );
$function$;

revoke all on function public.is_blocked(uuid,uuid) from public,anon,authenticated;
revoke all on function public.is_hidden_from(uuid,uuid) from public,anon,authenticated;

revoke all on function public.can_view_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_view_post(uuid) to authenticated;

revoke all on function public.notify_user(uuid,text,jsonb) from public,anon,authenticated;

revoke all on function public.follow_channel(uuid) from public,anon,authenticated;
revoke all on function public.unfollow_channel(uuid) from public,anon,authenticated;
revoke all on function public.block_user(uuid) from public,anon,authenticated;
revoke all on function public.unblock_user(uuid) from public,anon,authenticated;
revoke all on function public.hide_channel(uuid) from public,anon,authenticated;
revoke all on function public.unhide_channel(uuid) from public,anon,authenticated;
grant execute on function public.follow_channel(uuid) to authenticated;
grant execute on function public.unfollow_channel(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.hide_channel(uuid) to authenticated;
grant execute on function public.unhide_channel(uuid) to authenticated;

revoke all on function public.add_comment(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_comment(uuid) from public,anon,authenticated;
revoke all on function public.toggle_reaction(uuid,text) from public,anon,authenticated;
revoke all on function public.cast_poll_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_comment(uuid,text,uuid) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.toggle_reaction(uuid,text) to authenticated;
grant execute on function public.cast_poll_vote(uuid,uuid) to authenticated;

revoke all on function public.add_wishlist(uuid) from public,anon,authenticated;
revoke all on function public.remove_wishlist(uuid) from public,anon,authenticated;
grant execute on function public.add_wishlist(uuid) to authenticated;
grant execute on function public.remove_wishlist(uuid) to authenticated;

revoke all on function public.create_conversation(uuid) from public,anon,authenticated;
grant execute on function public.create_conversation(uuid) to authenticated;

-- Only the v2 message path is client-facing. It contains rate limiting,
-- attachment binding, DM mode checks, paid-message billing and notifications.
revoke all on function public.send_message_v2(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.send_message_v2(uuid,text,text,uuid,text) to authenticated;
revoke all on function public.send_message(uuid,text) from public,anon,authenticated;

revoke all on function public.create_locked_message(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.create_locked_message(uuid,text,bigint,text) to authenticated;

revoke all on function public.unlock_message(uuid,text) from public,anon,authenticated;
grant execute on function public.unlock_message(uuid,text) to authenticated;

revoke all on function public.mark_message_read(uuid) from public,anon,authenticated;
revoke all on function public.mark_conversation_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke all on function public.mark_notification_read(uuid) from public,anon,authenticated;
revoke all on function public.mark_all_notifications_read() from public,anon,authenticated;
revoke all on function public.get_unread_notification_count() from public,anon,authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_unread_notification_count() to authenticated;

revoke all on function public.register_push_subscription(text,text,text,text) from public,anon,authenticated;
revoke all on function public.remove_push_subscription(uuid) from public,anon,authenticated;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.remove_push_subscription(uuid) to authenticated;

revoke all on function public.start_call(uuid,text,text) from public,anon,authenticated;
revoke all on function public.heartbeat_call(uuid) from public,anon,authenticated;
revoke all on function public.end_call(uuid,text) from public,anon,authenticated;
revoke all on function public.issue_live_access(uuid) from public,anon,authenticated;
revoke all on function public.bill_active_calls() from public,anon,authenticated;
revoke all on function public.bill_private_live_sessions() from public,anon,authenticated;
grant execute on function public.start_call(uuid,text,text) to authenticated;
grant execute on function public.heartbeat_call(uuid) to authenticated;
grant execute on function public.end_call(uuid,text) to authenticated;
grant execute on function public.issue_live_access(uuid) to authenticated;
grant execute on function public.bill_active_calls() to service_role;
grant execute on function public.bill_private_live_sessions() to service_role;

-- Rate-limit state is server-only; mutation helper is exposed only to guarded RPCs.
alter table public.chat_rate_limits enable row level security;
revoke all on public.chat_rate_limits from anon,authenticated;

revoke all on function public.assert_chat_rate_limit(boolean) from public,anon,authenticated;
grant execute on function public.assert_chat_rate_limit(boolean) to authenticated;

insert into public.platform_settings(key,value)
values
  ('feature_flags.messaging','true'::jsonb),
  ('feature_flags.push','false'::jsonb),
  ('feature_flags.translation','false'::jsonb),
  ('feature_flags.live','false'::jsonb),
  ('feature_flags.private_calls','true'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

comment on table public.notifications is
  'Notification payloads are metadata-only. Sensitive message contents must never be copied into notification or push payloads.';
