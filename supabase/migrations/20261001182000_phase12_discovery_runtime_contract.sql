-- Prively Phase 12: real discovery and follow runtime contract.
-- Forward-only hardening. Reuses the existing follows/channels schema.

-- Discovery must be evaluated on the server so seed channels, inactive owners,
-- hidden channels and bilateral blocks never leak into the client directory.
create or replace function public.discover_channels(
  _search text default null,
  _city text default null,
  _bairro text default null,
  _province text default null,
  _limit integer default 50,
  _offset integer default 0
)
returns table (
  id uuid,
  owner_id uuid,
  handle text,
  display_name text,
  bio text,
  city text,
  bairro text,
  province text,
  follower_count bigint,
  is_following boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $phase12_discover$
  select
    c.id,
    c.owner_id,
    c.handle::text,
    c.display_name,
    c.bio,
    c.city,
    c.bairro,
    c.province,
    (
      select count(*)::bigint
      from public.follows f
      where f.channel_id = c.id
    ) as follower_count,
    exists (
      select 1
      from public.follows f2
      where f2.channel_id = c.id
        and f2.follower_id = auth.uid()
    ) as is_following
  from public.channels c
  join public.profiles p
    on p.id = c.owner_id
  where c.is_seed = false
    and p.status = 'active'
    and not exists (
      select 1
      from public.hidden_from h
      where h.channel_id = c.id
        and h.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.blocks b
      where (b.owner_id = c.owner_id and b.blocked_user_id = auth.uid())
         or (b.owner_id = auth.uid() and b.blocked_user_id = c.owner_id)
    )
    and (
      nullif(trim(coalesce(_search, '')), '') is null
      or c.handle::text ilike '%' || trim(_search) || '%'
      or c.display_name ilike '%' || trim(_search) || '%'
    )
    and (
      nullif(trim(coalesce(_city, '')), '') is null
      or lower(coalesce(c.city, '')) = lower(trim(_city))
    )
    and (
      nullif(trim(coalesce(_bairro, '')), '') is null
      or lower(coalesce(c.bairro, '')) = lower(trim(_bairro))
    )
    and (
      nullif(trim(coalesce(_province, '')), '') is null
      or lower(coalesce(c.province, '')) = lower(trim(_province))
    )
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(_limit, 50), 100))
  offset greatest(coalesce(_offset, 0), 0)
$phase12_discover$;

revoke all on function public.discover_channels(text,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.discover_channels(text,text,text,text,integer,integer) to authenticated;

-- The client never writes follows directly. The two RPCs are the only write path.
revoke insert, update, delete, truncate, references, trigger
  on public.follows from anon, authenticated;
grant select on public.follows to authenticated;

drop policy if exists follows_read_own_or_owner on public.follows;
create policy follows_read_own_or_owner
on public.follows
for select
to authenticated
using (
  follower_id = (select auth.uid())
  or exists (
    select 1
    from public.channels c
    where c.id = follows.channel_id
      and c.owner_id = (select auth.uid())
  )
);

revoke all on function public.follow_channel(uuid) from public, anon, authenticated;
grant execute on function public.follow_channel(uuid) to authenticated;

revoke all on function public.unfollow_channel(uuid) from public, anon, authenticated;
grant execute on function public.unfollow_channel(uuid) to authenticated;

create index if not exists follows_channel_id_idx
  on public.follows(channel_id);

create index if not exists channels_discovery_lookup_idx
  on public.channels(is_seed, city, bairro, province, created_at desc);

create index if not exists profiles_discovery_status_idx
  on public.profiles(status, id);
