-- Phase 7 RLS permission hardening: no client-facing execution grant for block oracle.

drop policy if exists conversations_parties on public.conversations;
create policy conversations_parties
on public.conversations for select to authenticated
using(
  (client_id=auth.uid() or creator_id=auth.uid())
  and not exists(
    select 1
    from public.blocks b
    where (b.owner_id=client_id and b.blocked_user_id=creator_id)
       or (b.owner_id=creator_id and b.blocked_user_id=client_id)
  )
);

drop policy if exists live_read on public.live_sessions;
create policy live_read
on public.live_sessions for select to authenticated
using (
  (
    exists(select 1 from public.channels c where c.id=live_sessions.channel_id and c.owner_id=auth.uid())
    or (
      live_sessions.mode in ('free','paid')
      and public.is_age_verified(auth.uid())
      and not exists(
        select 1
        from public.channels c
        join public.blocks b on
          ((b.owner_id=c.owner_id and b.blocked_user_id=auth.uid())
           or (b.owner_id=auth.uid() and b.blocked_user_id=c.owner_id))
        where c.id=live_sessions.channel_id
      )
    )
    or (
      live_sessions.mode='private'
      and live_sessions.private_client_id=auth.uid()
    )
  )
);
