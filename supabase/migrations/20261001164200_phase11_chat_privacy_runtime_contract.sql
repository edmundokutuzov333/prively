-- Prively Phase 11: chat privacy runtime reconciliation.
-- Forward-only hardening. Reuses the existing Phase 7 chat schema.
-- No demo data, no destructive data migration.

drop policy if exists admin_manage_all on public.blocks;
drop policy if exists admin_read_all on public.blocks;
drop policy if exists blocks_read_own on public.blocks;
drop policy if exists "owner manages own blocks" on public.blocks;

create policy blocks_owner_all
on public.blocks
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists messages_member on public.messages;
create policy messages_member
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = messages.conversation_id
      and cm.user_id = (select auth.uid())
      and not exists (
        select 1
        from public.blocks b
        where (b.owner_id = c.client_id and b.blocked_user_id = c.creator_id)
           or (b.owner_id = c.creator_id and b.blocked_user_id = c.client_id)
      )
  )
);

drop policy if exists message_attachments_member_read on public.message_attachments;
create policy message_attachments_member_read
on public.message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = message_attachments.conversation_id
      and cm.user_id = (select auth.uid())
      and not exists (
        select 1
        from public.blocks b
        where (b.owner_id = c.client_id and b.blocked_user_id = c.creator_id)
           or (b.owner_id = c.creator_id and b.blocked_user_id = c.client_id)
      )
  )
  and (
    owner_id = (select auth.uid())
    or (
      status = 'attached'
      and exists (
        select 1
        from public.messages m
        where m.id = message_attachments.message_id
          and (
            m.price is null
            or m.sender_id = (select auth.uid())
            or exists (
              select 1
              from public.message_unlocks u
              where u.message_id = m.id
                and u.user_id = (select auth.uid())
            )
          )
      )
    )
  )
);

drop policy if exists locked_content_member_read on public.message_locked_content;
create policy locked_content_member_read
on public.message_locked_content
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.conversation_members cm on cm.conversation_id = c.id
    where m.id = message_locked_content.message_id
      and cm.user_id = (select auth.uid())
      and not exists (
        select 1
        from public.blocks b
        where (b.owner_id = c.client_id and b.blocked_user_id = c.creator_id)
           or (b.owner_id = c.creator_id and b.blocked_user_id = c.client_id)
      )
      and (
        m.sender_id = (select auth.uid())
        or exists (
          select 1
          from public.message_unlocks u
          where u.message_id = m.id
            and u.user_id = (select auth.uid())
        )
      )
  )
);

create or replace function public.create_conversation(_channel uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $phase11_create_conversation$
declare
  creator_id uuid;
  mode text;
  conversation_id uuid;
begin
  if not public.is_age_verified((select auth.uid())) then
    raise exception 'age_not_verified';
  end if;

  select c.owner_id, c.dm_mode
    into creator_id, mode
  from public.channels c
  where c.id = _channel
    and exists (
      select 1
      from public.profiles p
      where p.id = c.owner_id
        and p.status = 'active'
    );

  if creator_id is null then
    raise exception 'channel_not_found';
  end if;

  if creator_id = (select auth.uid()) then
    raise exception 'self_conversation_not_allowed';
  end if;

  if public.is_blocked(creator_id, (select auth.uid())) then
    raise exception 'blocked';
  end if;

  if mode = 'off' then
    raise exception 'dm_closed';
  end if;

  if mode = 'subscribers'
     and not public.has_active_subscription((select auth.uid()), _channel) then
    raise exception 'subscription_required';
  end if;

  insert into public.conversations(client_id, creator_id, channel_id)
  values ((select auth.uid()), creator_id, _channel)
  on conflict (channel_id, client_id) do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select c.id into conversation_id
    from public.conversations c
    where c.channel_id = _channel
      and c.client_id = (select auth.uid());
  else
    insert into public.conversation_members(conversation_id, user_id)
    values (conversation_id, (select auth.uid())),
           (conversation_id, creator_id)
    on conflict do nothing;
  end if;

  return conversation_id;
end;
$phase11_create_conversation$;

revoke all on function public.create_conversation(uuid) from public, anon, authenticated;
grant execute on function public.create_conversation(uuid) to authenticated;

revoke all on function public.send_message(uuid, text) from public, anon, authenticated;
revoke all on function public.send_message_v2(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.send_message_v2(uuid, text, text, uuid, text) to authenticated;

comment on table public.conversations is
  'Private 1:1 client/creator conversations. Access is limited by membership, DM mode and bilateral blocks.';
comment on table public.messages is
  'Private conversation messages. Reads are participant-scoped and blocked pairs are denied.';
comment on table public.message_attachments is
  'Private chat attachments stored in the prively-chat bucket and exposed only to authorised conversation members.';
comment on table public.message_locked_content is
  'Private locked message bodies. Read access requires sender ownership or a recorded unlock and an active conversation privacy boundary.';
