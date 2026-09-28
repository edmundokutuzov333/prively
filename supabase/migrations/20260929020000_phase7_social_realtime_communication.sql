-- Prively Phase 7: Social Graph, Realtime & Communication
-- Runs on main only. No production seed data.
-- Source of truth: Phase 7 specification, with backward-compatible hardening of Phases 4-6.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Security helpers required by the Phase 4/5 access model
-- ---------------------------------------------------------------------------

create or replace function public.is_blocked(_a uuid, _b uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1
    from public.blocks
    where (owner_id=_a and blocked_user_id=_b)
       or (owner_id=_b and blocked_user_id=_a)
  );
$$;

create or replace function public.is_hidden_from(_channel uuid, _user uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.hidden_from
    where channel_id=_channel and user_id=_user
  );
$$;

revoke all on function public.is_blocked(uuid,uuid) from public, anon, authenticated;
revoke all on function public.is_hidden_from(uuid,uuid) from public, anon, authenticated;
grant execute on function public.is_blocked(uuid,uuid) to service_role;
grant execute on function public.is_hidden_from(uuid,uuid) to service_role;

-- Fix the Phase 5 source-of-truth access function by supplying the helpers it expects.
create or replace function public.can_view_post(_post_id uuid, _uid uuid)
returns boolean
language plpgsql stable security definer set search_path=public
as $$
declare
  p public.posts;
  c public.channels;
  tier_early_access boolean;
begin
  if _uid is null then return false; end if;

  select *
  into p
  from public.posts
  where id=_post_id
    and status='published'
    and (publish_at is null or publish_at<=now())
    and (expires_at is null or expires_at>now());

  if not found then return false; end if;

  select * into c from public.channels where id=p.channel_id;
  if not found then return false; end if;

  if _uid=c.owner_id then return true; end if;
  if not public.is_age_verified(_uid) then return false; end if;
  if public.is_blocked(c.owner_id,_uid) then return false; end if;
  if public.is_hidden_from(c.id,_uid) then return false; end if;

  if p.early_access_until is not null and now()<p.early_access_until then
    select t.early_access
    into tier_early_access
    from public.subscriptions s
    join public.subscription_tiers t on t.id=s.tier_id
    where s.subscriber_id=_uid
      and s.channel_id=c.id
      and s.status='active'
      and s.current_period_end>now()
    order by t.rank desc
    limit 1;
    if not coalesce(tier_early_access,false) then return false; end if;
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
      select 1 from public.ppv_purchases
      where buyer_id=_uid and post_id=p.id
    )
    else false
  end;
end;
$$;

revoke all on function public.can_view_post(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_view_post(uuid,uuid) to service_role;


-- Notification helper is defined before social mutations that call it.
create or replace function public.notify_user(
  _user uuid,
  _kind text,
  _payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path=public
as $
declare n uuid:=gen_random_uuid();
begin
  if _user is null then return null; end if;
  insert into public.notifications(id,user_id,kind,payload)
  values(n,_user,_kind,coalesce(_payload,'{}'::jsonb));
  return n;
end;
$;

revoke all on function public.notify_user(uuid,text,jsonb) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. Social graph
-- ---------------------------------------------------------------------------

create or replace function public.follow_channel(_channel uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  owner_id uuid;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;

  select c.owner_id into owner_id from public.channels c where c.id=_channel;
  if owner_id is null then raise exception 'channel_not_found'; end if;
  if owner_id=auth.uid() then raise exception 'self_follow_not_allowed'; end if;
  if public.is_blocked(owner_id,auth.uid()) then raise exception 'user_blocked'; end if;
  if public.is_hidden_from(_channel,auth.uid()) then raise exception 'channel_hidden'; end if;

  insert into public.follows(follower_id,channel_id)
  values(auth.uid(),_channel)
  on conflict do nothing;

  if found then
    perform public.notify_user(
      owner_id,
      'follow',
      jsonb_build_object('channel_id',_channel)
    );
  end if;

  perform public.award_configured_points(auth.uid(),'follow','channel',_channel);
end;
$$;

create or replace function public.unfollow_channel(_channel uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  delete from public.follows
  where follower_id=auth.uid() and channel_id=_channel;
end;
$$;

create or replace function public.block_user(_blocked uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if _blocked is null or _blocked=auth.uid() then raise exception 'invalid_block_target'; end if;
  if not exists(select 1 from public.profiles where id=_blocked) then raise exception 'user_not_found'; end if;

  insert into public.blocks(owner_id,blocked_user_id)
  values(auth.uid(),_blocked)
  on conflict do nothing;

  delete from public.follows
  where (follower_id=auth.uid() and channel_id in (select id from public.channels where owner_id=_blocked))
     or (follower_id=_blocked and channel_id in (select id from public.channels where owner_id=auth.uid()));
end;
$$;

create or replace function public.unblock_user(_blocked uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  delete from public.blocks
  where owner_id=auth.uid() and blocked_user_id=_blocked;
end;
$$;

create or replace function public.hide_channel(_channel uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.channels where id=_channel) then raise exception 'channel_not_found'; end if;

  insert into public.hidden_from(channel_id,user_id)
  values(_channel,auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.unhide_channel(_channel uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  delete from public.hidden_from
  where channel_id=_channel and user_id=auth.uid();
end;
$$;

revoke all on function public.follow_channel(uuid) from public, anon, authenticated;
revoke all on function public.unfollow_channel(uuid) from public, anon, authenticated;
revoke all on function public.block_user(uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.hide_channel(uuid) from public, anon, authenticated;
revoke all on function public.unhide_channel(uuid) from public, anon, authenticated;
grant execute on function public.follow_channel(uuid) to authenticated;
grant execute on function public.unfollow_channel(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.hide_channel(uuid) to authenticated;
grant execute on function public.unhide_channel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Comments and reactions
-- ---------------------------------------------------------------------------

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  parent_id uuid references public.comments on delete cascade,
  body text not null check(char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists comments_post_created_idx
  on public.comments(post_id,created_at desc);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  reaction_type text not null check(reaction_type in ('like','love','fire','wow')),
  created_at timestamptz not null default now(),
  unique(post_id,user_id,reaction_type)
);

create index if not exists reactions_post_idx
  on public.reactions(post_id);

alter table public.comments enable row level security;
alter table public.reactions enable row level security;

revoke all on public.comments,public.reactions from anon,authenticated;
grant select on public.comments,public.reactions to authenticated;

drop policy if exists comments_read_allowed on public.comments;
create policy comments_read_allowed
on public.comments for select to authenticated
using (
  public.can_view_post(post_id,auth.uid())
);

drop policy if exists reactions_read_allowed on public.reactions;
create policy reactions_read_allowed
on public.reactions for select to authenticated
using (
  public.can_view_post(post_id,auth.uid())
);

create or replace function public.add_comment(
  _post uuid,
  _body text,
  _parent uuid default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  p public.posts;
  cid uuid;
  owner_id uuid;
  mode text;
begin
  select * into p from public.posts where id=_post;
  if not found then raise exception 'post_not_found'; end if;
  if not public.can_view_post(_post,auth.uid()) then raise exception 'forbidden'; end if;

  if p.comments_mode='off' then raise exception 'comments_disabled'; end if;
  if p.comments_mode='subscribers' then
    if not public.has_active_subscription(auth.uid(),p.channel_id)
       and not public.is_creator_of_channel(auth.uid(),p.channel_id) then
      raise exception 'comments_subscribers_only';
    end if;
  end if;

  if public.is_blocked((select owner_id from public.channels where id=p.channel_id),auth.uid()) then
    raise exception 'user_blocked';
  end if;

  if char_length(trim(coalesce(_body,'')))<1 or char_length(_body)>2000 then raise exception 'invalid_comment'; end if;

  if _parent is not null and not exists(select 1 from public.comments where id=_parent and post_id=_post and deleted_at is null) then
    raise exception 'invalid_parent_comment';
  end if;

  insert into public.comments(post_id,user_id,parent_id,body)
  values(_post,auth.uid(),_parent,trim(_body))
  returning id into cid;

  select c.owner_id into owner_id from public.channels c where c.id=p.channel_id;
  if owner_id<>auth.uid() then
    perform public.notify_user(owner_id,'comment',jsonb_build_object('post_id',_post));
  end if;

  return cid;
end;
$$;

create or replace function public.delete_comment(_comment uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.comments
  set deleted_at=now(),updated_at=now(),body=''
  where id=_comment and user_id=auth.uid() and deleted_at is null;
  if not found then raise exception 'comment_not_found'; end if;
end;
$$;

create or replace function public.toggle_reaction(
  _post uuid,
  _type text
)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare existed boolean;
declare owner_id uuid;
begin
  if _type not in ('like','love','fire','wow') then raise exception 'invalid_reaction'; end if;
  if not public.can_view_post(_post,auth.uid()) then raise exception 'forbidden'; end if;

  select exists(
    select 1 from public.reactions
    where post_id=_post and user_id=auth.uid() and reaction_type=_type
  ) into existed;

  if existed then
    delete from public.reactions
    where post_id=_post and user_id=auth.uid() and reaction_type=_type;
    return false;
  end if;

  insert into public.reactions(post_id,user_id,reaction_type)
  values(_post,auth.uid(),_type)
  on conflict do nothing;

  select c.owner_id into owner_id
  from public.posts p join public.channels c on c.id=p.channel_id
  where p.id=_post;

  if owner_id is not null and owner_id<>auth.uid() then
    perform public.notify_user(owner_id,'reaction',jsonb_build_object('post_id',_post,'reaction',_type));
  end if;

  return true;
end;
$$;

revoke all on function public.add_comment(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_comment(uuid) from public,anon,authenticated;
revoke all on function public.toggle_reaction(uuid,text) from public,anon,authenticated;
grant execute on function public.add_comment(uuid,text,uuid) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.toggle_reaction(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Poll integrity and vote idempotency
-- ---------------------------------------------------------------------------

alter table public.poll_votes
  add constraint poll_votes_unique_user unique(poll_id,user_id);

create or replace function public.cast_poll_vote(_poll uuid,_option uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare p public.polls;
begin
  select * into p from public.polls where id=_poll for update;
  if not found or p.status<>'open' or (p.closes_at is not null and p.closes_at<=now()) then
    raise exception 'poll_closed';
  end if;

  if not public.can_view_post(
    (select id from public.posts where id is not null and channel_id=p.channel_id order by created_at desc limit 1),
    auth.uid()
  ) and not public.is_creator_of_channel(auth.uid(),p.channel_id) then
    -- Polls may exist independently of posts. Age and block checks still apply.
    if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
    if public.is_blocked((select owner_id from public.channels where id=p.channel_id),auth.uid()) then
      raise exception 'user_blocked';
    end if;
  end if;

  if not exists(select 1 from public.poll_options where id=_option and poll_id=_poll) then
    raise exception 'invalid_option';
  end if;

  insert into public.poll_votes(poll_id,option_id,user_id)
  values(_poll,_option,auth.uid())
  on conflict(poll_id,user_id) do update set option_id=excluded.option_id,created_at=now();
end;
$$;

revoke all on function public.cast_poll_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cast_poll_vote(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Wishlist server contract
-- ---------------------------------------------------------------------------

create or replace function public.add_wishlist(_post uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.can_view_post(_post,auth.uid()) then raise exception 'forbidden'; end if;
  insert into public.wishlist(user_id,post_id)
  values(auth.uid(),_post)
  on conflict do nothing;
end;
$$;

create or replace function public.remove_wishlist(_post uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  delete from public.wishlist where user_id=auth.uid() and post_id=_post;
end;
$$;

revoke all on function public.add_wishlist(uuid) from public,anon,authenticated;
revoke all on function public.remove_wishlist(uuid) from public,anon,authenticated;
grant execute on function public.add_wishlist(uuid) to authenticated;
grant execute on function public.remove_wishlist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Conversation messages: locked content, attachments, translations
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists price bigint,
  add column if not exists locked_content_id uuid,
  add column if not exists read_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check(kind in ('text','image','video','audio','gift','tip','system'));

alter table public.messages
  add constraint messages_price_check
  check(price is null or price>0);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id,created_at);

create table if not exists public.message_locked_content (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.message_unlocks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  unique(message_id,user_id)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  message_id uuid references public.messages on delete set null,
  owner_id uuid not null references public.profiles on delete cascade,
  storage_path text not null unique,
  kind text not null check(kind in ('image','video','audio','file')),
  mime_type text not null,
  file_size bigint not null check(file_size between 1 and 25000000),
  sha256 text,
  status text not null default 'pending' check(status in ('pending','attached','failed','deleted')),
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments(message_id);

create table if not exists public.message_translations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages on delete cascade,
  language text not null check(char_length(language) between 2 and 12),
  translated_body text not null,
  provider text not null,
  created_at timestamptz not null default now(),
  unique(message_id,language)
);

create index if not exists message_translations_message_idx
  on public.message_translations(message_id);

alter table public.message_locked_content enable row level security;
alter table public.message_unlocks enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_translations enable row level security;

revoke all on public.message_locked_content,public.message_unlocks,public.message_attachments,public.message_translations from anon,authenticated;
grant select on public.message_unlocks,public.message_attachments,public.message_translations to authenticated;

drop policy if exists locked_content_member_read on public.message_locked_content;
create policy locked_content_member_read
on public.message_locked_content for select to authenticated
using (
  exists(
    select 1
    from public.messages m
    join public.conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=auth.uid()
    where m.id=message_locked_content.message_id
      and (
        m.sender_id=auth.uid()
        or exists(select 1 from public.message_unlocks u where u.message_id=m.id and u.user_id=auth.uid())
      )
  )
);

drop policy if exists message_unlocks_own_read on public.message_unlocks;
create policy message_unlocks_own_read
on public.message_unlocks for select to authenticated
using(user_id=auth.uid());

drop policy if exists message_attachments_member_read on public.message_attachments;
create policy message_attachments_member_read
on public.message_attachments for select to authenticated
using (
  exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id=message_attachments.conversation_id
      and cm.user_id=auth.uid()
  )
  and (
    status='attached'
    or owner_id=auth.uid()
  )
);

drop policy if exists message_translations_member_read on public.message_translations;
create policy message_translations_member_read
on public.message_translations for select to authenticated
using (
  exists(
    select 1
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id=m.conversation_id and cm.user_id=auth.uid()
    where m.id=message_translations.message_id
      and (
        m.sender_id=auth.uid()
        or m.price is null
        or exists(select 1 from public.message_unlocks u where u.message_id=m.id and u.user_id=auth.uid())
      )
  )
);

-- Prevent direct browser writes to chat records.
revoke all on public.messages from anon,authenticated;
grant select on public.messages to authenticated;
revoke all on public.conversation_members from anon,authenticated;
grant select on public.conversation_members to authenticated;
revoke all on public.conversations from anon,authenticated;
grant select on public.conversations to authenticated;

-- Fix the pre-existing tautological RLS condition.
drop policy if exists messages_member on public.messages;
create policy messages_member
on public.messages for select to authenticated
using (
  exists(
    select 1
    from public.conversation_members cm
    where cm.conversation_id=messages.conversation_id
      and cm.user_id=auth.uid()
  )
);

-- Remove broad admin visibility for private messages. Phase 8 will provide Compliance View.
drop policy if exists admin_read_all on public.messages;
drop policy if exists admin_manage_all on public.messages;

drop policy if exists conversations_parties on public.conversations;
create policy conversations_parties
on public.conversations for select to authenticated
using(
  (client_id=auth.uid() or creator_id=auth.uid())
  and not public.is_blocked(client_id,creator_id)
);

create or replace function public.create_conversation(_channel uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  owner_id uuid;
  cid uuid;
  mode text;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;

  select c.owner_id,c.dm_mode into owner_id,mode
  from public.channels c where c.id=_channel;
  if owner_id is null then raise exception 'channel_not_found'; end if;
  if owner_id=auth.uid() then raise exception 'self_conversation_not_allowed'; end if;
  if public.is_blocked(owner_id,auth.uid()) then raise exception 'user_blocked'; end if;
  if public.is_hidden_from(_channel,auth.uid()) then raise exception 'channel_hidden'; end if;
  if mode='off' then raise exception 'dm_disabled'; end if;
  if mode='subscribers' and not public.has_active_subscription(auth.uid(),_channel) then
    raise exception 'subscription_required';
  end if;

  select id into cid
  from public.conversations
  where client_id=auth.uid() and channel_id=_channel
  limit 1;

  if cid is not null then return cid; end if;

  insert into public.conversations(client_id,creator_id,channel_id)
  values(auth.uid(),owner_id,_channel)
  returning id into cid;

  insert into public.conversation_members(conversation_id,user_id)
  values(cid,auth.uid()),(cid,owner_id);

  return cid;
end;
$$;

revoke all on function public.create_conversation(uuid) from public,anon,authenticated;
grant execute on function public.create_conversation(uuid) to authenticated;

create or replace function public.send_message_v2(
  _conversation uuid,
  _body text default null,
  _kind text default 'text',
  _attachment_id uuid default null,
  _idem text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  c public.conversations;
  channel_owner uuid;
  mode text;
  dm_price bigint;
  message_id uuid:=gen_random_uuid();
  idem_key text;
  attachment public.message_attachments;
  auto_reply text;
begin
  select * into c from public.conversations where id=_conversation;
  if not found then raise exception 'conversation_not_found'; end if;

  if not exists(
    select 1 from public.conversation_members
    where conversation_id=_conversation and user_id=auth.uid()
  ) then raise exception 'forbidden'; end if;

  if public.is_blocked(c.client_id,c.creator_id) then raise exception 'user_blocked'; end if;
  if public.is_blocked(c.creator_id,auth.uid()) then raise exception 'user_blocked'; end if;

  select ch.owner_id,ch.dm_mode,ch.dm_price
  into channel_owner,mode,dm_price
  from public.channels ch where ch.id=c.channel_id;

  if auth.uid()<>channel_owner and mode='off' then raise exception 'dm_disabled'; end if;
  if auth.uid()<>channel_owner and mode='subscribers'
     and not public.has_active_subscription(auth.uid(),c.channel_id) then
    raise exception 'subscription_required';
  end if;

  if auth.uid()<>channel_owner and _kind not in ('text','image','video','audio') then
    raise exception 'invalid_message_kind';
  end if;

  if char_length(trim(coalesce(_body,'')))=0 and _attachment_id is null then
    raise exception 'message_content_required';
  end if;
  if char_length(coalesce(_body,''))>5000 then raise exception 'invalid_message'; end if;

  if _attachment_id is not null then
    select * into attachment
    from public.message_attachments
    where id=_attachment_id
      and conversation_id=_conversation
      and owner_id=auth.uid()
      and status='pending'
    for update;
    if not found then raise exception 'attachment_not_available'; end if;
  end if;

  idem_key:=coalesce(nullif(trim(_idem),''), 'message:'||_conversation::text||':'||message_id::text);

  if auth.uid()<>channel_owner and mode='paid' then
    if dm_price is null or dm_price<=0 then raise exception 'message_price_not_configured'; end if;

    perform public._spend_on_channel(
      auth.uid(),
      c.channel_id,
      dm_price,
      'message',
      'conversation',
      _conversation,
      idem_key
    );
  end if;

  insert into public.messages(id,conversation_id,sender_id,kind,body,price)
  values(
    message_id,
    _conversation,
    auth.uid(),
    case when _kind='system_auto_reply' then 'system' else _kind end,
    nullif(trim(_body),''),
    case when auth.uid()<>channel_owner and mode='paid' then dm_price else null end
  );

  if _attachment_id is not null then
    update public.message_attachments
    set message_id=message_id,status='attached'
    where id=_attachment_id;
  end if;

  if auth.uid()<>c.creator_id then
    select a.reply into auto_reply
    from public.auto_replies a
    where a.channel_id=c.channel_id
      and a.enabled
      and (
        lower(a.trigger)=lower(trim(coalesce(_body,'')))
        or a.trigger='*'
      )
    order by case when lower(a.trigger)=lower(trim(coalesce(_body,''))) then 0 else 1 end
    limit 1;

    if auto_reply is not null then
      insert into public.messages(conversation_id,sender_id,kind,body)
      values(c.id,c.creator_id,'system',auto_reply);
    end if;
  end if;

  if auth.uid()=c.client_id then
    perform public.notify_user(
      c.creator_id,
      'message',
      jsonb_build_object('conversation_id',_conversation,'message_id',message_id)
    );
  else
    perform public.notify_user(
      c.client_id,
      'message',
      jsonb_build_object('conversation_id',_conversation,'message_id',message_id)
    );
  end if;

  return message_id;
end;
$$;

create or replace function public.send_message(_conversation uuid,_body text)
returns uuid
language plpgsql security definer set search_path=public
as $$
begin
  return public.send_message_v2(_conversation,_body,'text',null,null);
end;
$$;

revoke all on function public.send_message_v2(uuid,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.send_message(uuid,text) from public,anon,authenticated;
grant execute on function public.send_message_v2(uuid,text,text,uuid,text) to authenticated;
grant execute on function public.send_message(uuid,text) to authenticated;

create or replace function public.create_locked_message(
  _conversation uuid,
  _body text,
  _price bigint,
  _idem text
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  c public.conversations;
  owner_id uuid;
  m uuid:=gen_random_uuid();
  content_id uuid:=gen_random_uuid();
begin
  select * into c from public.conversations where id=_conversation;
  if not found then raise exception 'conversation_not_found'; end if;

  select ch.owner_id into owner_id from public.channels ch where ch.id=c.channel_id;
  if owner_id<>auth.uid() then raise exception 'forbidden'; end if;
  if _price is null or _price<=0 then raise exception 'invalid_message_price'; end if;
  if char_length(trim(_body))<1 or char_length(_body)>10000 then raise exception 'invalid_message'; end if;
  if public.is_blocked(c.client_id,c.creator_id) then raise exception 'user_blocked'; end if;

  insert into public.messages(id,conversation_id,sender_id,kind,price,locked_content_id)
  values(m,_conversation,auth.uid(),'text',_price,content_id);

  insert into public.message_locked_content(id,message_id,body)
  values(content_id,m,_body);

  perform public.notify_user(
    c.client_id,
    'message',
    jsonb_build_object('conversation_id',_conversation,'message_id',m)
  );

  return m;
end;
$$;

revoke all on function public.create_locked_message(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.create_locked_message(uuid,text,bigint,text) to authenticated;

create or replace function public.unlock_message(
  _message uuid,
  _idem text
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  m public.messages;
  c public.conversations;
  txn uuid;
begin
  select * into m from public.messages where id=_message for share;
  if not found then raise exception 'message_not_found'; end if;
  if m.locked_content_id is null or m.price is null then raise exception 'message_not_locked'; end if;

  select * into c from public.conversations where id=m.conversation_id;
  if not exists(select 1 from public.conversation_members where conversation_id=m.conversation_id and user_id=auth.uid()) then
    raise exception 'forbidden';
  end if;
  if m.sender_id=auth.uid() then return m.id; end if;
  if public.is_blocked(c.client_id,c.creator_id) then raise exception 'user_blocked'; end if;

  select u.txn_id into txn
  from public.message_unlocks u
  where u.message_id=_message and u.user_id=auth.uid();

  if txn is not null then return txn; end if;

  txn:=public._spend_on_channel(
    auth.uid(),
    c.channel_id,
    m.price,
    'message',
    'message',
    _message,
    coalesce(nullif(trim(_idem),''),'unlock:'||_message::text)
  );

  insert into public.message_unlocks(message_id,user_id,txn_id)
  values(_message,auth.uid(),txn)
  on conflict(message_id,user_id) do nothing;

  return txn;
end;
$$;

revoke all on function public.unlock_message(uuid,text) from public,anon,authenticated;
grant execute on function public.unlock_message(uuid,text) to authenticated;

create or replace function public.mark_message_read(_message uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.messages m
  set read_at=now(),updated_at=now()
  where m.id=_message
    and exists(
      select 1 from public.conversation_members cm
      where cm.conversation_id=m.conversation_id and cm.user_id=auth.uid()
    )
    and m.sender_id<>auth.uid();
end;
$$;

create or replace function public.mark_conversation_read(_conversation uuid)
returns integer
language plpgsql security definer set search_path=public
as $$
declare n integer;
begin
  update public.messages m
  set read_at=now(),updated_at=now()
  where m.conversation_id=_conversation
    and m.sender_id<>auth.uid()
    and m.read_at is null
    and exists(
      select 1 from public.conversation_members cm
      where cm.conversation_id=_conversation and cm.user_id=auth.uid()
    );
  get diagnostics n=row_count;
  return n;
end;
$$;

revoke all on function public.mark_message_read(uuid) from public,anon,authenticated;
revoke all on function public.mark_conversation_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Notification core and push subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,endpoint)
);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;

drop policy if exists notifications_own on public.notifications;
create policy notifications_own
on public.notifications for select to authenticated
using(user_id=auth.uid());

revoke all on public.push_subscriptions from anon,authenticated;
grant select on public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
on public.push_subscriptions for select to authenticated
using(user_id=auth.uid());

create or replace function public.mark_notification_read(_notification uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=_notification and user_id=auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql security definer set search_path=public
as $$
declare n integer;
begin
  update public.notifications
  set read_at=coalesce(read_at,now())
  where user_id=auth.uid() and read_at is null;
  get diagnostics n=row_count;
  return n;
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql stable security definer set search_path=public
as $$
  select count(*)::integer from public.notifications
  where user_id=auth.uid() and read_at is null;
$$;

create or replace function public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth text,
  _device_label text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare id uuid;
begin
  if char_length(coalesce(_endpoint,''))<20 then raise exception 'invalid_push_endpoint'; end if;
  if char_length(coalesce(_p256dh,''))<10 or char_length(coalesce(_auth,''))<8 then raise exception 'invalid_push_keys'; end if;

  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,device_label,enabled,updated_at)
  values(auth.uid(),trim(_endpoint),trim(_p256dh),trim(_auth),nullif(trim(_device_label),''),true,now())
  on conflict(user_id,endpoint)
  do update set p256dh=excluded.p256dh,auth=excluded.auth,device_label=excluded.device_label,enabled=true,updated_at=now()
  returning push_subscriptions.id into id;

  return id;
end;
$$;

create or replace function public.remove_push_subscription(_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.push_subscriptions
  set enabled=false,updated_at=now()
  where id=_id and user_id=auth.uid();
end;
$$;

revoke all on function public.notify_user(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.mark_notification_read(uuid) from public,anon,authenticated;
revoke all on function public.mark_all_notifications_read() from public,anon,authenticated;
revoke all on function public.get_unread_notification_count() from public,anon,authenticated;
revoke all on function public.register_push_subscription(text,text,text,text) from public,anon,authenticated;
revoke all on function public.remove_push_subscription(uuid) from public,anon,authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_unread_notification_count() to authenticated;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.remove_push_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Chat attachment bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets(id,name,public)
values('prively-chat','prively-chat',false)
on conflict(id) do update set public=false;

-- ---------------------------------------------------------------------------
-- 9. Live sessions and call hardening
-- ---------------------------------------------------------------------------

alter table public.live_sessions
  drop constraint if exists live_sessions_mode_check;

alter table public.live_sessions
  add constraint live_sessions_mode_check
  check(mode in ('free','paid','private'));

alter table public.live_sessions
  add column if not exists per_minute_price bigint,
  add column if not exists private_client_id uuid references public.profiles,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists billed_minutes integer not null default 0,
  add column if not exists end_reason text;

alter table public.call_sessions
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_warning_at timestamptz,
  add column if not exists end_reason text;

create index if not exists live_private_client_idx
  on public.live_sessions(private_client_id)
  where private_client_id is not null;

create index if not exists active_calls_heartbeat_idx
  on public.call_sessions(status,last_heartbeat_at)
  where status='active';

create or replace function public.start_call(
  _channel uuid,
  _kind text,
  _idem text
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  c public.channels;
  existing_id uuid;
  room text;
  price bigint;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  if _kind not in ('audio','video') then raise exception 'invalid_call_kind'; end if;
  if _idem is null or char_length(trim(_idem))<8 then raise exception 'idempotency_key_required'; end if;

  select * into c from public.channels where id=_channel for share;
  if not found then raise exception 'channel_not_found'; end if;
  if c.owner_id=auth.uid() then raise exception 'self_call_not_allowed'; end if;
  if public.is_blocked(c.owner_id,auth.uid()) then raise exception 'user_blocked'; end if;
  if public.is_hidden_from(_channel,auth.uid()) then raise exception 'channel_hidden'; end if;

  if c.dm_mode='off' then raise exception 'dm_disabled'; end if;
  if c.dm_mode='subscribers' and not public.has_active_subscription(auth.uid(),_channel) then
    raise exception 'subscription_required';
  end if;

  price:=case when _kind='audio' then c.call_audio_price else c.call_video_price end;
  if price is null or price<=0 then raise exception 'call_price_not_configured'; end if;

  select cs.id into existing_id
  from public.call_sessions cs
  where cs.client_id=auth.uid()
    and cs.channel_id=_channel
    and cs.status in ('requested','active')
  order by cs.created_at desc
  limit 1;

  if existing_id is not null then return existing_id; end if;

  room:='prively-call-'||gen_random_uuid()::text;

  insert into public.call_sessions(
    channel_id,client_id,kind,per_minute_price,room_name,status
  )
  values(_channel,auth.uid(),_kind,price,room,'requested')
  returning id into existing_id;

  perform public.notify_user(
    c.owner_id,
    'call_request',
    jsonb_build_object('call_session_id',existing_id,'kind',_kind)
  );

  return existing_id;
end;
$$;

create or replace function public.heartbeat_call(_call uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  c public.call_sessions;
  minutes_now integer;
  next_minute integer;
  wallet_balance bigint;
  warning boolean:=false;
  remaining_seconds integer:=0;
begin
  select * into c
  from public.call_sessions
  where id=_call
    and status='active'
    and (
      client_id=auth.uid()
      or public.is_creator_of_channel(auth.uid(),channel_id)
    )
  for update;

  if not found then raise exception 'call_not_active'; end if;

  update public.call_sessions
  set last_heartbeat_at=now()
  where id=_call;

  if c.client_id=auth.uid() then
    minutes_now:=floor(extract(epoch from(now()-c.started_at))/60);
    next_minute:=greatest(c.billed_minutes+1,minutes_now);

    select coalesce(balance,0) into wallet_balance
    from public.balances
    where owner_id=auth.uid() and account='wallet'
    for update;

    if coalesce(wallet_balance,0)<c.per_minute_price then
      remaining_seconds:=greatest(0,60-floor(mod(extract(epoch from(now()-c.started_at))::numeric,60))::integer);
      if remaining_seconds<=30 then
        warning:=true;
        if c.last_warning_at is null or c.last_warning_at<now()-interval '30 seconds' then
          update public.call_sessions set last_warning_at=now() where id=_call;
          perform public.notify_user(
            c.client_id,
            'call_balance_low',
            jsonb_build_object('call_session_id',_call,'seconds_remaining',remaining_seconds)
          );
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'call_id',_call,
    'server_time',now(),
    'status','active',
    'warning',warning,
    'remaining_seconds',remaining_seconds
  );
end;
$$;

create or replace function public.end_call(_call uuid,_reason text default 'ended_by_user')
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.call_sessions
  set status='ended',ended_at=coalesce(ended_at,now()),end_reason=coalesce(nullif(trim(_reason),''),'ended_by_user')
  where id=_call
    and status in ('requested','active')
    and (
      client_id=auth.uid()
      or public.is_creator_of_channel(auth.uid(),channel_id)
    );

  if not found then raise exception 'call_not_found'; end if;
end;
$$;

create or replace function public.issue_live_access(_session uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  s public.live_sessions;
  c public.call_sessions;
  uid uuid:=auth.uid();
  owner_id uuid;
begin
  if not public.is_age_verified(uid) then raise exception 'age_not_verified'; end if;

  select * into s from public.live_sessions where id=_session for update;
  if found then
    select ch.owner_id into owner_id from public.channels ch where ch.id=s.channel_id;
    if public.is_blocked(owner_id,uid) then raise exception 'user_blocked'; end if;
    if public.is_hidden_from(s.channel_id,uid) and owner_id<>uid then raise exception 'channel_hidden'; end if;
    if s.status not in ('scheduled','live') then raise exception 'live_not_available'; end if;
    if s.scheduled_at is not null and s.scheduled_at>now() then raise exception 'live_not_available'; end if;

    if s.mode='paid' and owner_id<>uid and not exists(
      select 1 from public.live_tickets where live_session_id=s.id and buyer_id=uid
    ) then
      raise exception 'live_ticket_required';
    end if;

    if s.mode='private' and uid<>owner_id and uid<>s.private_client_id then
      raise exception 'private_live_not_allowed';
    end if;

    if s.mode='private' and uid=s.private_client_id and coalesce(
      (select balance from public.balances where owner_id=uid and account='wallet'),0
    )<coalesce(s.per_minute_price,0) then
      raise exception 'insufficient_funds';
    end if;

    update public.live_sessions
    set status='live',started_at=coalesce(started_at,now()),last_heartbeat_at=now()
    where id=s.id;

    return jsonb_build_object(
      'kind','live',
      'session_id',s.id,
      'room_name',s.room_name,
      'mode',s.mode,
      'role',case when uid=owner_id then 'host' else 'viewer' end,
      'per_minute_price',s.per_minute_price
    );
  end if;

  select * into c
  from public.call_sessions
  where id=_session
  for update;

  if found then
    if c.status in('ended','cancelled') then raise exception 'call_not_available'; end if;
    if c.client_id<>uid and not public.is_creator_of_channel(uid,c.channel_id) then
      raise exception 'call_not_available';
    end if;
    if public.is_blocked(c.client_id,(select owner_id from public.channels where id=c.channel_id)) then
      raise exception 'user_blocked';
    end if;

    if c.client_id=uid and coalesce(
      (select balance from public.balances where owner_id=uid and account='wallet'),0
    )<c.per_minute_price then
      raise exception 'insufficient_funds';
    end if;

    update public.call_sessions
    set status='active',started_at=coalesce(started_at,now()),last_heartbeat_at=now()
    where id=c.id;

    return jsonb_build_object(
      'kind','call',
      'session_id',c.id,
      'room_name',c.room_name,
      'mode',c.kind,
      'role',case when c.client_id=uid then 'caller' else 'host' end,
      'per_minute_price',c.per_minute_price
    );
  end if;

  raise exception 'session_not_found';
end;
$$;

create or replace function public.bill_active_calls()
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  c public.call_sessions;
  elapsed_minutes integer;
  next_minute integer;
  billed integer:=0;
  bill_count integer;
  active_client_balance bigint;
  locked_seconds integer;
begin
  for c in
    select *
    from public.call_sessions
    where status='active'
      and started_at is not null
    order by started_at
    for update skip locked
  loop
    -- A missing heartbeat is treated as a disconnected client.
    if c.last_heartbeat_at is not null and c.last_heartbeat_at<now()-interval '45 seconds' then
      update public.call_sessions
      set status='ended',ended_at=now(),end_reason='heartbeat_timeout'
      where id=c.id;
      continue;
    end if;

    elapsed_minutes:=floor(extract(epoch from(now()-c.started_at))/60);
    if elapsed_minutes<=c.billed_minutes then continue; end if;

    bill_count:=elapsed_minutes-c.billed_minutes;

    begin
      select coalesce(balance,0) into active_client_balance
      from public.balances
      where owner_id=c.client_id and account='wallet'
      for update;

      if active_client_balance < c.per_minute_price then
        update public.call_sessions
        set status='ended',ended_at=now(),end_reason='insufficient_funds'
        where id=c.id;
        perform public.notify_user(
          c.client_id,
          'call_ended_balance',
          jsonb_build_object('call_session_id',c.id)
        );
        continue;
      end if;

      for next_minute in c.billed_minutes+1..elapsed_minutes loop
        perform public._spend_on_channel(
          c.client_id,
          c.channel_id,
          c.per_minute_price,
          'call_minute',
          'call_session',
          c.id,
          'call:'||c.id::text||':minute:'||next_minute::text
        );
        billed:=billed+1;
      end loop;

      update public.call_sessions
      set billed_minutes=elapsed_minutes,last_heartbeat_at=coalesce(last_heartbeat_at,now())
      where id=c.id;
    exception when others then
      update public.call_sessions
      set status='ended',ended_at=now(),end_reason=case when sqlstate='P0001' then 'insufficient_funds' else 'billing_error' end
      where id=c.id;
      perform public.notify_user(
        c.client_id,
        'call_ended_balance',
        jsonb_build_object('call_session_id',c.id)
      );
    end;
  end loop;

  return billed;
end;
$$;

-- Private live rooms are billed by the same server-side wallet/ledger mechanism.
create or replace function public.bill_private_live_sessions()
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  s public.live_sessions;
  elapsed_minutes integer;
  next_minute integer;
  billed integer:=0;
  wallet_balance bigint;
begin
  for s in
    select *
    from public.live_sessions
    where mode='private'
      and status='live'
      and started_at is not null
    order by started_at
    for update skip locked
  loop
    if s.last_heartbeat_at is not null and s.last_heartbeat_at<now()-interval '45 seconds' then
      update public.live_sessions
      set status='ended',ended_at=now()
      where id=s.id;
      continue;
    end if;

    elapsed_minutes:=floor(extract(epoch from(now()-s.started_at))/60);
    if elapsed_minutes<=s.billed_minutes then continue; end if;

    select coalesce(balance,0) into wallet_balance
    from public.balances
    where owner_id=s.private_client_id and account='wallet'
    for update;

    if wallet_balance < coalesce(s.per_minute_price,0) then
      update public.live_sessions set status='ended',ended_at=now() where id=s.id;
      perform public.notify_user(s.private_client_id,'live_ended_balance',jsonb_build_object('live_session_id',s.id));
      continue;
    end if;

    begin
      for next_minute in s.billed_minutes+1..elapsed_minutes loop
        perform public._spend_on_channel(
          s.private_client_id,
          s.channel_id,
          s.per_minute_price,
          'call_minute',
          'live_session',
          s.id,
          'private-live:'||s.id::text||':minute:'||next_minute::text
        );
        billed:=billed+1;
      end loop;

      update public.live_sessions set billed_minutes=elapsed_minutes where id=s.id;
    exception when others then
      update public.live_sessions set status='ended',ended_at=now() where id=s.id;
      perform public.notify_user(s.private_client_id,'live_ended_balance',jsonb_build_object('live_session_id',s.id));
    end;
  end loop;
  return billed;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- 10. Realtime publication and protected private topics
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array[
    'messages',
    'notifications',
    'conversation_members',
    'call_sessions',
    'live_sessions',
    'follows',
    'comments',
    'reactions'
  ]
  loop
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end
$$;

create or replace function public.realtime_conversation_id(_topic text)
returns uuid
language plpgsql immutable
as $$
declare result uuid;
begin
  if _topic is null or _topic !~ '^conv:[0-9a-fA-F-]{36}$' then return null; end if;
  begin
    result:=split_part(_topic,':',2)::uuid;
    return result;
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function public.realtime_conversation_id(text) from public,anon;
grant execute on function public.realtime_conversation_id(text) to authenticated;

alter table realtime.messages enable row level security;

drop policy if exists prively_conv_receive on realtime.messages;
create policy prively_conv_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast','presence')
  and exists(
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
  and exists(
    select 1
    from public.conversation_members cm
    where cm.conversation_id=public.realtime_conversation_id(realtime.topic())
      and cm.user_id=auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 11. Rate limits for chat and Realtime mutation endpoints
-- ---------------------------------------------------------------------------

create table if not exists public.chat_rate_limits (
  user_id uuid primary key references public.profiles on delete cascade,
  window_started_at timestamptz not null default now(),
  message_count integer not null default 0,
  attachment_count integer not null default 0
);

create or replace function public.assert_chat_rate_limit(_is_attachment boolean default false)
returns void
language plpgsql security definer set search_path=public
as $$
declare r public.chat_rate_limits;
declare now_ts timestamptz:=now();
declare max_messages integer:=60;
declare max_attachments integer:=20;
begin
  insert into public.chat_rate_limits(user_id,window_started_at,message_count,attachment_count)
  values(auth.uid(),now_ts,0,0)
  on conflict(user_id) do nothing;

  select * into r from public.chat_rate_limits where user_id=auth.uid() for update;

  if r.window_started_at<now_ts-interval '1 minute' then
    update public.chat_rate_limits
    set window_started_at=now_ts,message_count=0,attachment_count=0
    where user_id=auth.uid();
    r.window_started_at:=now_ts;
    r.message_count:=0;
    r.attachment_count:=0;
  end if;

  if _is_attachment then
    if r.attachment_count>=max_attachments then raise exception 'chat_rate_limited'; end if;
    update public.chat_rate_limits set attachment_count=attachment_count+1 where user_id=auth.uid();
  else
    if r.message_count>=max_messages then raise exception 'chat_rate_limited'; end if;
    update public.chat_rate_limits set message_count=message_count+1 where user_id=auth.uid();
  end if;
end;
$$;

revoke all on function public.assert_chat_rate_limit(boolean) from public,anon,authenticated;
grant execute on function public.assert_chat_rate_limit(boolean) to authenticated;

-- Apply rate limiting inside the real mutation.
create or replace function public.send_message_v2(
  _conversation uuid,
  _body text default null,
  _kind text default 'text',
  _attachment_id uuid default null,
  _idem text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  c public.conversations;
  channel_owner uuid;
  mode text;
  dm_price bigint;
  message_id uuid:=gen_random_uuid();
  idem_key text;
  attachment public.message_attachments;
  auto_reply text;
begin
  select * into c from public.conversations where id=_conversation;
  if not found then raise exception 'conversation_not_found'; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=_conversation and user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if public.is_blocked(c.client_id,c.creator_id) then raise exception 'user_blocked'; end if;
  if public.is_blocked(c.creator_id,auth.uid()) then raise exception 'user_blocked'; end if;

  select ch.owner_id,ch.dm_mode,ch.dm_price into channel_owner,mode,dm_price
  from public.channels ch where ch.id=c.channel_id;

  if auth.uid()<>channel_owner and mode='off' then raise exception 'dm_disabled'; end if;
  if auth.uid()<>channel_owner and mode='subscribers'
     and not public.has_active_subscription(auth.uid(),c.channel_id) then raise exception 'subscription_required'; end if;

  if _kind not in ('text','image','video','audio') then raise exception 'invalid_message_kind'; end if;
  if char_length(trim(coalesce(_body,'')))=0 and _attachment_id is null then raise exception 'message_content_required'; end if;
  if char_length(coalesce(_body,''))>5000 then raise exception 'invalid_message'; end if;

  perform public.assert_chat_rate_limit(_attachment_id is not null);

  if _attachment_id is not null then
    select * into attachment
    from public.message_attachments
    where id=_attachment_id
      and conversation_id=_conversation
      and owner_id=auth.uid()
      and status='pending'
    for update;
    if not found then raise exception 'attachment_not_available'; end if;
  end if;

  idem_key:=coalesce(nullif(trim(_idem),''),'message:'||_conversation::text||':'||message_id::text);

  if auth.uid()<>channel_owner and mode='paid' then
    if dm_price is null or dm_price<=0 then raise exception 'message_price_not_configured'; end if;
    perform public._spend_on_channel(auth.uid(),c.channel_id,dm_price,'message','conversation',_conversation,idem_key);
  end if;

  insert into public.messages(id,conversation_id,sender_id,kind,body,price)
  values(message_id,_conversation,auth.uid(),_kind,nullif(trim(_body),''),case when auth.uid()<>channel_owner and mode='paid' then dm_price else null end);

  if _attachment_id is not null then
    update public.message_attachments set message_id=message_id,status='attached' where id=_attachment_id;
  end if;

  if auth.uid()<>c.creator_id then
    select a.reply into auto_reply
    from public.auto_replies a
    where a.channel_id=c.channel_id and a.enabled
      and (lower(a.trigger)=lower(trim(coalesce(_body,''))) or a.trigger='*')
    order by case when lower(a.trigger)=lower(trim(coalesce(_body,''))) then 0 else 1 end
    limit 1;

    if auto_reply is not null then
      insert into public.messages(conversation_id,sender_id,kind,body)
      values(c.id,c.creator_id,'system',auto_reply);
    end if;
  end if;

  perform public.notify_user(
    case when auth.uid()=c.client_id then c.creator_id else c.client_id end,
    'message',
    jsonb_build_object('conversation_id',_conversation,'message_id',message_id)
  );

  return message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Scheduled jobs
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform cron.unschedule('prively-reconcile-ledger-v2');
  exception when others then null;
  end;

  begin
    perform cron.unschedule('prively-bill-private-live');
  exception when others then null;
  end;

  begin
    perform cron.unschedule('prively-bill-calls');
  exception when others then null;
  end;

  perform cron.schedule('prively-bill-calls','* * * * *','select public.bill_active_calls();');
  perform cron.schedule('prively-bill-private-live','* * * * *','select public.bill_private_live_sessions();');
end
$$;

-- ---------------------------------------------------------------------------
-- 13. Basic RLS and grants for social graph hardening
-- ---------------------------------------------------------------------------

alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.hidden_from enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke insert,update,delete on public.follows,public.blocks,public.hidden_from from anon,authenticated;
revoke insert,update,delete on public.messages,public.conversations,public.conversation_members from anon,authenticated;

-- Do not expose block lists or hidden lists to arbitrary users.
drop policy if exists blocks_own on public.blocks;
drop policy if exists blocks_read_own on public.blocks;
create policy blocks_read_own
on public.blocks for select to authenticated
using(owner_id=auth.uid());

drop policy if exists hidden_owner on public.hidden_from;
create policy hidden_owner_read
on public.hidden_from for select to authenticated
using(user_id=auth.uid());

-- Follow visibility: only the owner of the follow relation or channel owner may see it.
drop policy if exists follows_own on public.follows;
create policy follows_read_own_or_owner
on public.follows for select to authenticated
using(
  follower_id=auth.uid()
  or exists(select 1 from public.channels c where c.id=follows.channel_id and c.owner_id=auth.uid())
);

-- Conversation member rows expose only the current user's membership.
drop policy if exists conversation_members_own on public.conversation_members;
create policy conversation_members_own
on public.conversation_members for select to authenticated
using(user_id=auth.uid());

-- ---------------------------------------------------------------------------
-- 14. Server contracts for notification privacy and future translation/live workers
-- ---------------------------------------------------------------------------

insert into public.platform_settings(key,value)
values
  ('feature_flags.messaging','true'::jsonb),
  ('feature_flags.push','false'::jsonb),
  ('feature_flags.translation','false'::jsonb),
  ('feature_flags.live','false'::jsonb),
  ('feature_flags.private_calls','true'::jsonb)
on conflict(key) do nothing;

-- Keep notification payloads metadata-only. Never place message body, real name or explicit content here.
comment on table public.notifications is
  'Notification payloads are metadata-only. Sensitive message contents must never be copied into push or notification payloads.';
