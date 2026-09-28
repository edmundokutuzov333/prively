-- Phase 7 authorization boundary: client-safe one-argument access check.
-- The two-argument form remains internal for service-role/media authorization.

create or replace function public.can_view_post(_post_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select public.can_view_post(_post_id, auth.uid());
$$;

revoke all on function public.can_view_post(uuid) from public,anon;
grant execute on function public.can_view_post(uuid) to authenticated;

drop policy if exists posts_visible on public.posts;
create policy posts_visible
on public.posts for select to authenticated
using (
  public.is_creator_of_channel(auth.uid(),channel_id)
  or public.can_view_post(id)
);

drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read
on public.media_assets for select to authenticated
using (
  public.is_creator_of_channel(auth.uid(),channel_id)
  or exists(
    select 1
    from public.posts p
    where p.id=media_assets.post_id
      and public.can_view_post(p.id)
  )
);

drop policy if exists comments_read_allowed on public.comments;
create policy comments_read_allowed
on public.comments for select to authenticated
using(public.can_view_post(post_id));
