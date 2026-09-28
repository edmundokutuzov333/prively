create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_cron;

create type public.app_role as enum ('client','creator','agency','moderator','support','finance','compliance','admin');
create type public.ledger_account as enum ('wallet','creator_pending','creator_available','escrow','platform_revenue','external');
create type public.visibility as enum ('public','followers','subscribers','tier','ppv','private');

create table public.user_roles (
  user_id uuid not null references auth.users on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key(user_id,role)
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  handle citext unique not null check(handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null,
  avatar_path text,
  city text,
  bairro text,
  locale text not null default 'pt-MZ',
  currency text not null default 'MZN' check(currency in ('MZN','USD','EUR','ZAR')),
  age_verified_at timestamptz,
  status text not null default 'pending' check(status in ('pending','active','suspended','banned')),
  self_excluded_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;

create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare h text;
begin
  h:=lower(trim(coalesce(new.raw_user_meta_data->>'handle','')));
  if h !~ '^[a-z0-9_]{3,24}$' then h:='priv_'||replace(left(new.id::text,18),'-',''); end if;
  insert into public.profiles(id,handle,display_name)
  values(new.id,h,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),h));
  insert into public.user_roles(user_id,role) values(new.id,'client') on conflict do nothing;
  return new;
exception when unique_violation then
  insert into public.profiles(id,handle,display_name)
  values(new.id,'priv_'||replace(left(new.id::text,18),'-'),'Prively');
  insert into public.user_roles(user_id,role) values(new.id,'client') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.has_role(_uid uuid,_role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.user_roles where user_id=_uid and role=_role);
$$;

create or replace function public.is_age_verified(_uid uuid)
returns boolean language sql stable security definer set search_path=public as $$
select exists(
  select 1 from public.profiles
  where id=_uid and age_verified_at is not null and status='active'
    and (self_excluded_until is null or self_excluded_until<=now())
);
$$;

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  handle citext unique not null check(handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null,
  bio text,
  city text,
  bairro text,
  dm_mode text not null default 'subscribers' check(dm_mode in ('off','free','paid','subscribers')),
  dm_price bigint check(dm_price is null or dm_price>0),
  call_audio_price bigint check(call_audio_price is null or call_audio_price>0),
  call_video_price bigint check(call_video_price is null or call_video_price>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_channels_updated_at before update on public.channels
for each row execute function public.set_updated_at();

create table public.follows(
  follower_id uuid not null references public.profiles on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,channel_id)
);
create table public.blocks(
  owner_id uuid not null references public.profiles on delete cascade,
  blocked_user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,blocked_user_id)
);
create table public.hidden_from(
  channel_id uuid not null references public.channels on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(channel_id,user_id)
);

create or replace function public.is_creator_of_channel(_uid uuid,_channel uuid)
returns boolean language sql stable security definer set search_path=public as $$
select exists(
 select 1 from public.channels c
 join public.user_roles r on r.user_id=c.owner_id and r.role='creator'
 where c.id=_channel and c.owner_id=_uid
);
$$;

create table public.subscription_tiers(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  name text not null check(name in ('Bronze','Prata','Ouro','VIP')),
  rank smallint not null check(rank between 1 and 4),
  price_month bigint not null check(price_month>0),
  discounts jsonb not null default '{"3":0.15,"6":0.25,"12":0.40}'::jsonb,
  early_access boolean not null default false,
  unique(channel_id,rank)
);
create table public.subscriptions(
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.profiles on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  tier_id uuid not null references public.subscription_tiers,
  period_months smallint not null check(period_months in (1,3,6,12)),
  price_paid bigint not null check(price_paid>0),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  status text not null default 'active' check(status in ('active','past_due','cancelled','expired')),
  created_at timestamptz not null default now(),
  unique(subscriber_id,channel_id)
);

create or replace function public.has_active_subscription(_uid uuid,_channel uuid)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.subscriptions where subscriber_id=_uid and channel_id=_channel and status='active' and current_period_end>now());
$$;
create or replace function public.has_tier_rank(_uid uuid,_channel uuid,_rank smallint)
returns boolean language sql stable security definer set search_path=public as $$
select exists(
 select 1 from public.subscriptions s join public.subscription_tiers t on t.id=s.tier_id
 where s.subscriber_id=_uid and s.channel_id=_channel and s.status='active' and s.current_period_end>now() and t.rank>=coalesce(_rank,1)
);
$$;

create table public.posts(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  caption text,
  visibility public.visibility not null default 'subscribers',
  min_tier_rank smallint check(min_tier_rank between 1 and 4),
  price bigint check(price is null or price>0),
  status text not null default 'draft' check(status in ('draft','scheduled','published','removed')),
  publish_at timestamptz,
  expires_at timestamptz,
  is_story boolean not null default false,
  blurhash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_posts_updated_at before update on public.posts
for each row execute function public.set_updated_at();

create table public.media_assets(
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  kind text not null check(kind in ('image','video','audio')),
  storage_path text not null,
  hls_path text,
  thumb_blur_path text,
  sha256 text not null,
  scan_status text not null default 'pending' check(scan_status in ('pending','clean','flagged')),
  created_at timestamptz not null default now()
);

create table public.ppv_purchases(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles on delete cascade,
  post_id uuid not null references public.posts on delete cascade,
  price_paid bigint not null,
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  unique(buyer_id,post_id)
);
create table public.wishlist(
  user_id uuid not null references public.profiles on delete cascade,
  post_id uuid not null references public.posts on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,post_id)
);

create table public.platform_settings(
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(key,value) values
('commission.default','0.30'::jsonb),
('commission.by_kind','{}'::jsonb),
('hold_hours','72'::jsonb),
('payout.min_centavos','50000'::jsonb),
('referral.enabled','false'::jsonb),
('referral.share_rate','0'::jsonb),
('referral.window_days','0'::jsonb),
('loyalty.configured','false'::jsonb)
on conflict do nothing;

create table public.idempotency_keys(
  owner_id uuid not null references public.profiles on delete cascade,
  key text not null,
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,key)
);
create table public.ledger_entries(
  id bigint generated always as identity primary key,
  txn_id uuid not null,
  account public.ledger_account not null,
  owner_id uuid not null,
  amount bigint not null,
  kind text not null,
  ref_type text,
  ref_id uuid,
  release_at timestamptz,
  release_source_id bigint,
  created_at timestamptz not null default now()
);
create table public.balances(
  owner_id uuid not null,
  account public.ledger_account not null,
  balance bigint not null default 0,
  primary key(owner_id,account),
  check(account<>'wallet' or balance>=0)
);
create table public.spend_limits(
  user_id uuid primary key references public.profiles on delete cascade,
  daily bigint,
  weekly bigint,
  monthly bigint,
  updated_at timestamptz not null default now()
);

create table public.escrow_records(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles on delete cascade,
  beneficiary_id uuid not null references public.profiles,
  source_type text not null,
  source_id uuid not null,
  amount bigint not null check(amount>0),
  status text not null default 'held' check(status in ('held','released','refunded','disputed')),
  held_txn uuid not null,
  resolved_txn uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.tips(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles,
  channel_id uuid not null references public.channels,
  amount bigint not null check(amount>0),
  message text,
  txn_id uuid not null,
  created_at timestamptz not null default now()
);
create table public.gifts_catalog(
  id uuid primary key default gen_random_uuid(),
  code citext unique not null,
  name text not null,
  price bigint not null check(price>0),
  animation_key text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.gifts_sent(
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles,
  channel_id uuid not null references public.channels,
  gift_id uuid not null references public.gifts_catalog,
  quantity integer not null default 1 check(quantity between 1 and 100),
  message text,
  txn_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.custom_requests(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles,
  channel_id uuid not null references public.channels,
  brief text not null check(char_length(trim(brief)) between 10 and 5000),
  budget bigint not null check(budget>0),
  idempotency_key text,
  status text not null default 'pending' check(status in ('pending','accepted','in_progress','delivered','declined','released','disputed','refunded')),
  escrow_id uuid references public.escrow_records,
  delivery_post_id uuid references public.posts,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,idempotency_key)
);
create trigger trg_custom_requests_updated_at before update on public.custom_requests
for each row execute function public.set_updated_at();

create table public.auctions(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  post_id uuid references public.posts,
  title text not null,
  description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  minimum_bid bigint not null check(minimum_bid>0),
  status text not null default 'scheduled' check(status in ('scheduled','live','closed','cancelled')),
  winner_bid_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create trigger trg_auctions_updated_at before update on public.auctions
for each row execute function public.set_updated_at();

create table public.bids(
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions on delete cascade,
  bidder_id uuid not null references public.profiles,
  amount bigint not null check(amount>0),
  escrow_id uuid not null references public.escrow_records,
  status text not null default 'active' check(status in ('active','outbid','won','refunded')),
  created_at timestamptz not null default now()
);

create table public.bundles(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  name text not null,
  description text,
  price bigint not null check(price>0),
  expires_at timestamptz,
  status text not null default 'active' check(status in ('draft','active','ended')),
  created_at timestamptz not null default now()
);
create table public.bundle_items(
  bundle_id uuid not null references public.bundles on delete cascade,
  post_id uuid not null references public.posts on delete cascade,
  primary key(bundle_id,post_id)
);
create table public.bundle_purchases(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles,
  bundle_id uuid not null references public.bundles,
  price_paid bigint not null,
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  unique(buyer_id,bundle_id)
);

create table public.products(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  name text not null,
  description text,
  price bigint not null check(price>0),
  stock integer not null default 0 check(stock>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create table public.orders(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles,
  channel_id uuid not null references public.channels,
  total bigint not null check(total>0),
  status text not null default 'paid_escrow' check(status in ('paid_escrow','accepted','shipped','delivered','released','refunded','disputed','cancelled')),
  escrow_id uuid references public.escrow_records,
  idempotency_key text,
  shipping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(buyer_id,idempotency_key)
);
create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create table public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  product_id uuid not null references public.products,
  quantity integer not null check(quantity>0),
  unit_price bigint not null check(unit_price>0)
);

create table public.live_sessions(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  mode text not null check(mode in ('free','paid')),
  title text not null,
  description text,
  price bigint check(price is null or price>0),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'scheduled' check(status in ('scheduled','live','ended','cancelled')),
  room_name text unique not null,
  created_at timestamptz not null default now()
);
create table public.live_tickets(
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions on delete cascade,
  buyer_id uuid not null references public.profiles,
  price_paid bigint not null,
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  unique(live_session_id,buyer_id)
);
create table public.call_sessions(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  client_id uuid not null references public.profiles,
  kind text not null check(kind in ('audio','video')),
  per_minute_price bigint not null check(per_minute_price>0),
  room_name text unique not null,
  status text not null default 'requested' check(status in ('requested','active','ended','cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  billed_minutes integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.giveaways(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  winner_count smallint not null default 1 check(winner_count between 1 and 20),
  requires_subscription boolean not null default true,
  draw_seed text,
  status text not null default 'scheduled' check(status in ('scheduled','open','drawn','cancelled')),
  created_at timestamptz not null default now()
);
create table public.giveaway_entries(
  giveaway_id uuid not null references public.giveaways on delete cascade,
  user_id uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  winner boolean not null default false,
  primary key(giveaway_id,user_id)
);

create table public.polls(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  question text not null,
  closes_at timestamptz,
  status text not null default 'open' check(status in ('draft','open','closed')),
  created_at timestamptz not null default now()
);
create table public.poll_options(
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  label text not null,
  sort_order smallint not null
);
create table public.poll_votes(
  poll_id uuid not null references public.polls on delete cascade,
  option_id uuid not null references public.poll_options on delete cascade,
  user_id uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  primary key(poll_id,user_id)
);

create table public.loyalty_points(
  user_id uuid primary key references public.profiles on delete cascade,
  points bigint not null default 0,
  lifetime_points bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.point_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  points bigint not null,
  kind text not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create table public.missions(
  id uuid primary key default gen_random_uuid(),
  code citext unique not null,
  name_key text not null,
  description_key text not null,
  target integer not null check(target>0),
  points_reward bigint not null check(points_reward>=0),
  active boolean not null default false
);
create table public.mission_progress(
  mission_id uuid not null references public.missions on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  progress integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(mission_id,user_id)
);
create table public.streaks(
  user_id uuid primary key references public.profiles on delete cascade,
  current_days integer not null default 0,
  longest_days integer not null default 0,
  last_day date
);
create table public.badges(
  id uuid primary key default gen_random_uuid(),
  code citext unique not null,
  name_key text not null,
  description_key text not null,
  points_threshold bigint,
  active boolean not null default false
);
create table public.user_badges(
  user_id uuid not null references public.profiles on delete cascade,
  badge_id uuid not null references public.badges on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key(user_id,badge_id)
);

create table public.creator_rankings_weekly(
  week_start date not null,
  channel_id uuid not null references public.channels on delete cascade,
  rank integer not null,
  score bigint not null,
  primary key(week_start,channel_id)
);
create table public.fan_rankings_weekly(
  week_start date not null,
  user_id uuid not null references public.profiles on delete cascade,
  rank integer not null,
  score bigint not null,
  primary key(week_start,user_id)
);

create table public.analytics_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  channel_id uuid references public.channels on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create table public.creator_analytics_daily(
  channel_id uuid not null references public.channels on delete cascade,
  day date not null,
  views bigint not null default 0,
  unique_viewers bigint not null default 0,
  messages bigint not null default 0,
  sales bigint not null default 0,
  gross_amount bigint not null default 0,
  tips bigint not null default 0,
  live_minutes bigint not null default 0,
  primary key(channel_id,day)
);

create table public.availability_slots(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  area_label text,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create table public.fan_notes(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  fan_id uuid not null references public.profiles on delete cascade,
  tag text,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_fan_notes_updated_at before update on public.fan_notes
for each row execute function public.set_updated_at();
create table public.creator_goals(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  name text not null,
  target_amount bigint not null check(target_amount>0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check(status in ('draft','active','achieved','expired','cancelled')),
  check(ends_at>starts_at)
);
create table public.referral_codes(
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles on delete cascade,
  code citext unique not null,
  active boolean not null default true
);
create table public.referrals(
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles on delete cascade,
  referred_id uuid unique not null references public.profiles on delete cascade,
  code citext not null,
  status text not null default 'active' check(status in ('pending','active','expired','revoked')),
  activated_at timestamptz
);

create table public.auto_replies(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  trigger text not null,
  reply text not null,
  enabled boolean not null default true
);
create table public.conversations(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles on delete cascade,
  creator_id uuid not null references public.profiles on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  created_at timestamptz not null default now(),
  unique(client_id,channel_id)
);
create table public.conversation_members(
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key(conversation_id,user_id)
);
create table public.messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null references public.profiles,
  kind text not null check(kind in ('text','image','video','audio','gift','tip','system','system_auto_reply')),
  body text,
  created_at timestamptz not null default now()
);

create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.receipts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  txn_id uuid not null,
  kind text not null,
  amount bigint not null,
  created_at timestamptz not null default now()
);

create table public.kyc_verifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  provider text not null,
  provider_ref text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','review')),
  doc_path text,
  selfie_path text,
  reviewed_by uuid references public.profiles,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.hidden_from enable row level security;
alter table public.subscription_tiers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.posts enable row level security;
alter table public.media_assets enable row level security;
alter table public.ppv_purchases enable row level security;
alter table public.wishlist enable row level security;
alter table public.platform_settings enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.balances enable row level security;
alter table public.spend_limits enable row level security;
alter table public.escrow_records enable row level security;
alter table public.tips enable row level security;
alter table public.gifts_catalog enable row level security;
alter table public.gifts_sent enable row level security;
alter table public.custom_requests enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;
alter table public.bundle_purchases enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_tickets enable row level security;
alter table public.call_sessions enable row level security;
alter table public.giveaways enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.loyalty_points enable row level security;
alter table public.point_events enable row level security;
alter table public.missions enable row level security;
alter table public.mission_progress enable row level security;
alter table public.streaks enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.creator_rankings_weekly enable row level security;
alter table public.fan_rankings_weekly enable row level security;
alter table public.analytics_events enable row level security;
alter table public.creator_analytics_daily enable row level security;
alter table public.availability_slots enable row level security;
alter table public.fan_notes enable row level security;
alter table public.creator_goals enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.auto_replies enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.receipts enable row level security;
alter table public.kyc_verifications enable row level security;

create policy profiles_own_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy roles_own_read on public.user_roles for select to authenticated using(user_id=auth.uid());
create policy channels_read on public.channels for select to authenticated using(public.is_age_verified(auth.uid()) or owner_id=auth.uid());
create policy channels_owner_write on public.channels for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and public.has_role(auth.uid(),'creator'));
create policy follows_own on public.follows for all to authenticated using(follower_id=auth.uid()) with check(follower_id=auth.uid());
create policy blocks_own on public.blocks for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy hidden_owner on public.hidden_from for all to authenticated using(user_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy tiers_read on public.subscription_tiers for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy subscriptions_parties on public.subscriptions for select to authenticated using(subscriber_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy posts_read on public.posts for select to authenticated using(public.is_age_verified(auth.uid()) and status='published' or public.is_creator_of_channel(auth.uid(),channel_id));
create policy posts_owner_write on public.posts for insert to authenticated with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy posts_owner_update on public.posts for update to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy posts_owner_delete on public.posts for delete to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id));
create policy media_owner on public.media_assets for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy ppv_parties on public.ppv_purchases for select to authenticated using(buyer_id=auth.uid() or exists(select 1 from public.posts p join public.channels c on c.id=p.channel_id where p.id=post_id and c.owner_id=auth.uid()));
create policy wishlist_own on public.wishlist for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy settings_admin on public.platform_settings for select to authenticated using(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'finance'));
create policy idempotency_own on public.idempotency_keys for select to authenticated using(owner_id=auth.uid());
create policy ledger_own on public.ledger_entries for select to authenticated using(owner_id=auth.uid() or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));
create policy balances_own on public.balances for select to authenticated using(owner_id=auth.uid() or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));
create policy spend_limits_own on public.spend_limits for select to authenticated using(user_id=auth.uid());
create policy escrow_parties on public.escrow_records for select to authenticated using(buyer_id=auth.uid() or beneficiary_id=auth.uid() or public.has_role(auth.uid(),'support') or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));
create policy tips_parties on public.tips for select to authenticated using(buyer_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy gifts_catalog_read on public.gifts_catalog for select to authenticated using(active or public.has_role(auth.uid(),'admin'));
create policy gifts_sent_parties on public.gifts_sent for select to authenticated using(sender_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy custom_request_parties on public.custom_requests for select to authenticated using(client_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy auctions_read on public.auctions for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy bids_parties on public.bids for select to authenticated using(bidder_id=auth.uid() or exists(select 1 from public.auctions a where a.id=auction_id and public.is_creator_of_channel(auth.uid(),a.channel_id)));
create policy bundles_read on public.bundles for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy bundle_items_read on public.bundle_items for select to authenticated using(public.is_age_verified(auth.uid()));
create policy bundle_purchases_own on public.bundle_purchases for select to authenticated using(buyer_id=auth.uid());
create policy products_read on public.products for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy products_owner_write on public.products for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy orders_parties on public.orders for select to authenticated using(buyer_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy order_items_parties on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or public.is_creator_of_channel(auth.uid(),o.channel_id))));
create policy live_read on public.live_sessions for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy live_tickets_parties on public.live_tickets for select to authenticated using(buyer_id=auth.uid() or exists(select 1 from public.live_sessions s where s.id=live_session_id and public.is_creator_of_channel(auth.uid(),s.channel_id)));
create policy call_parties on public.call_sessions for select to authenticated using(client_id=auth.uid() or public.is_creator_of_channel(auth.uid(),channel_id));
create policy giveaways_read on public.giveaways for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy giveaway_entries_parties on public.giveaway_entries for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.giveaways g where g.id=giveaway_id and public.is_creator_of_channel(auth.uid(),g.channel_id)));
create policy polls_read on public.polls for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy poll_options_read on public.poll_options for select to authenticated using(exists(select 1 from public.polls p where p.id=poll_id and public.is_age_verified(auth.uid())));
create policy poll_votes_own on public.poll_votes for select to authenticated using(user_id=auth.uid());
create policy loyalty_own on public.loyalty_points for select to authenticated using(user_id=auth.uid());
create policy point_events_own on public.point_events for select to authenticated using(user_id=auth.uid());
create policy missions_read on public.missions for select to authenticated using(active or public.has_role(auth.uid(),'admin'));
create policy mission_progress_own on public.mission_progress for select to authenticated using(user_id=auth.uid());
create policy streak_own on public.streaks for select to authenticated using(user_id=auth.uid());
create policy badges_read on public.badges for select to authenticated using(active or public.has_role(auth.uid(),'admin'));
create policy user_badges_own on public.user_badges for select to authenticated using(user_id=auth.uid());
create policy creator_rankings_read on public.creator_rankings_weekly for select to authenticated using(public.is_age_verified(auth.uid()));
create policy fan_rankings_read on public.fan_rankings_weekly for select to authenticated using(public.is_age_verified(auth.uid()));
create policy analytics_own on public.analytics_events for select to authenticated using(user_id=auth.uid() or (channel_id is not null and public.is_creator_of_channel(auth.uid(),channel_id)));
create policy analytics_insert_own on public.analytics_events for insert to authenticated with check(user_id=auth.uid());
create policy analytics_daily_owner on public.creator_analytics_daily for select to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id));
create policy availability_read on public.availability_slots for select to authenticated using(public.is_age_verified(auth.uid()) or public.is_creator_of_channel(auth.uid(),channel_id));
create policy availability_owner on public.availability_slots for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy fan_notes_owner on public.fan_notes for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy goals_owner on public.creator_goals for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy referral_codes_own on public.referral_codes for select to authenticated using(creator_id=auth.uid());
create policy referrals_party on public.referrals for select to authenticated using(referrer_id=auth.uid() or referred_id=auth.uid());
create policy auto_replies_owner on public.auto_replies for all to authenticated using(public.is_creator_of_channel(auth.uid(),channel_id)) with check(public.is_creator_of_channel(auth.uid(),channel_id));
create policy conversations_parties on public.conversations for select to authenticated using(client_id=auth.uid() or creator_id=auth.uid());
create policy conversation_members_own on public.conversation_members for select to authenticated using(user_id=auth.uid());
create policy messages_member on public.messages for select to authenticated using(exists(select 1 from public.conversation_members m where m.conversation_id=conversation_id and m.user_id=auth.uid()));
create policy notifications_own on public.notifications for select to authenticated using(user_id=auth.uid());
create policy receipts_own on public.receipts for select to authenticated using(user_id=auth.uid());
create policy kyc_no_direct_read on public.kyc_verifications for select to authenticated using(false);

insert into storage.buckets(id,name,public) values('prively-private','prively-private',false) on conflict(id) do nothing;
create policy prively_private_owner_read on storage.objects for select to authenticated using(bucket_id='prively-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy prively_private_owner_write on storage.objects for insert to authenticated with check(bucket_id='prively-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy prively_private_owner_update on storage.objects for update to authenticated using(bucket_id='prively-private' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='prively-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy prively_private_owner_delete on storage.objects for delete to authenticated using(bucket_id='prively-private' and (storage.foldername(name))[1]=auth.uid()::text);

create index ledger_owner_time_idx on public.ledger_entries(owner_id,created_at);
create index posts_channel_status_idx on public.posts(channel_id,status,publish_at);
create index messages_conversation_time_idx on public.messages(conversation_id,created_at);
create index analytics_channel_time_idx on public.analytics_events(channel_id,occurred_at);
create index bids_auction_idx on public.bids(auction_id,status,amount desc);
