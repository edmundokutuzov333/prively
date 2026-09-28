create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare p public.posts;
declare c public.channels;
begin
  if auth.uid() is not null and _uid<>auth.uid() then return false; end if;
  select * into p
  from public.posts
  where id=_post_id
    and status='published'
    and (publish_at is null or publish_at<=now())
    and (expires_at is null or expires_at>now());
  if not found then return false; end if;

  select * into c from public.channels where id=p.channel_id;
  if _uid=c.owner_id then return true; end if;
  if not public.is_age_verified(_uid) then return false; end if;

  if exists(
    select 1 from public.media_assets a
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
    select 1 from public.blocks
    where (owner_id=c.owner_id and blocked_user_id=_uid)
       or (owner_id=_uid and blocked_user_id=c.owner_id)
  ) then return false; end if;

  if exists(select 1 from public.hidden_from where channel_id=c.id and user_id=_uid) then return false; end if;

  return case p.visibility
    when 'public' then true
    when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
    when 'subscribers' then public.has_active_subscription(_uid,c.id)
    when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
    when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
      or exists(
        select 1
        from public.bundle_purchases bp
        join public.bundle_items bi on bi.bundle_id=bp.bundle_id
        where bp.buyer_id=_uid and bi.post_id=p.id
      )
    else false
  end;
end
$$;

grant execute on function public.can_view_post(uuid,uuid) to authenticated;
revoke execute on function public.can_view_post(uuid,uuid) from public,anon;
grant execute on function public.can_view_post(uuid,uuid) to authenticated;