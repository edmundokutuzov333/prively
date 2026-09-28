create or replace function public.has_role(_uid uuid,_role public.app_role)
returns boolean language sql stable security definer set search_path=public
as $$
select case when auth.uid() is not null and _uid<>auth.uid() then false
else exists(select 1 from public.user_roles where user_id=_uid and role=_role) end
$$;

create or replace function public.is_age_verified(_uid uuid)
returns boolean language sql stable security definer set search_path=public
as $$
select case when auth.uid() is not null and _uid<>auth.uid() then false
else exists(
  select 1 from public.profiles
  where id=_uid and age_verified_at is not null and status='active'
    and (self_excluded_until is null or self_excluded_until<=now())
) end
$$;

create or replace function public.is_creator_of_channel(_uid uuid,_channel uuid)
returns boolean language sql stable security definer set search_path=public
as $$
select case when auth.uid() is not null and _uid<>auth.uid() then false
else exists(
 select 1 from public.channels c
 join public.user_roles r on r.user_id=c.owner_id and r.role='creator'
 where c.id=_channel and c.owner_id=_uid
) end
$$;

create or replace function public.has_active_subscription(_uid uuid,_channel uuid)
returns boolean language sql stable security definer set search_path=public
as $$
select case when auth.uid() is not null and _uid<>auth.uid() then false
else exists(
 select 1 from public.subscriptions
 where subscriber_id=_uid and channel_id=_channel and status='active' and current_period_end>now()
) end
$$;

create or replace function public.has_tier_rank(_uid uuid,_channel uuid,_rank smallint)
returns boolean language sql stable security definer set search_path=public
as $$
select case when auth.uid() is not null and _uid<>auth.uid() then false
else exists(
 select 1 from public.subscriptions s
 join public.subscription_tiers t on t.id=s.tier_id
 where s.subscriber_id=_uid and s.channel_id=_channel and s.status='active'
   and s.current_period_end>now() and t.rank>=coalesce(_rank,1)
) end
$$;

create or replace function public.can_view_post(_post_id uuid,_uid uuid)
returns boolean language plpgsql stable security definer set search_path=public
as $$
declare p public.posts; c public.channels;
begin
 if auth.uid() is not null and _uid<>auth.uid() then return false; end if;
 select * into p from public.posts where id=_post_id and status='published'
   and (publish_at is null or publish_at<=now()) and (expires_at is null or expires_at>now());
 if not found then return false; end if;
 select * into c from public.channels where id=p.channel_id;
 if _uid=c.owner_id then return true; end if;
 if not public.is_age_verified(_uid) then return false; end if;
 if exists(select 1 from public.blocks where (owner_id=c.owner_id and blocked_user_id=_uid) or (owner_id=_uid and blocked_user_id=c.owner_id)) then return false; end if;
 if exists(select 1 from public.hidden_from where channel_id=c.id and user_id=_uid) then return false; end if;
 return case p.visibility
   when 'public' then true
   when 'followers' then exists(select 1 from public.follows where follower_id=_uid and channel_id=c.id)
   when 'subscribers' then public.has_active_subscription(_uid,c.id)
   when 'tier' then public.has_tier_rank(_uid,c.id,p.min_tier_rank)
   when 'ppv' then exists(select 1 from public.ppv_purchases where buyer_id=_uid and post_id=p.id)
     or exists(select 1 from public.bundle_purchases bp join public.bundle_items bi on bi.bundle_id=bp.bundle_id where bp.buyer_id=_uid and bi.post_id=p.id)
   else false
 end;
end
$$;

grant execute on function public.has_role(uuid,public.app_role) to authenticated;
grant execute on function public.is_age_verified(uuid) to authenticated;
grant execute on function public.is_creator_of_channel(uuid,uuid) to authenticated;
grant execute on function public.has_active_subscription(uuid,uuid) to authenticated;
grant execute on function public.has_tier_rank(uuid,uuid,smallint) to authenticated;
grant execute on function public.can_view_post(uuid,uuid) to authenticated;