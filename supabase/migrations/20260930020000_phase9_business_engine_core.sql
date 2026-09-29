
-- Prively Fase 9: Business Engine & Advanced Monetization
-- Schema foundations and future-facing domain contracts.
-- All monetary values are bigint MZN centavos.

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  code citext not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  kind text not null check (kind in ('percent','fixed')),
  value bigint not null check (value > 0),
  applies_to text not null default 'all'
    check (applies_to in ('all','bundle','product','custom_request','subscription','ppv','gift')),
  min_subtotal bigint check (min_subtotal is null or min_subtotal >= 0),
  max_discount bigint check (max_discount is null or max_discount > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit smallint not null default 1 check (per_user_limit between 1 and 50),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default false,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'percent' and value between 1 and 10000) or (kind = 'fixed' and value > 0)),
  check (ends_at is null or ends_at > starts_at),
  unique (channel_id, code)
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  order_id uuid references public.orders on delete set null,
  bundle_purchase_id uuid references public.bundle_purchases on delete set null,
  discount_amount bigint not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemptions_promotion_idx
  on public.promotion_redemptions(promotion_id, created_at desc);
create index if not exists promotion_redemptions_user_idx
  on public.promotion_redemptions(user_id, created_at desc);

do $$
begin
  alter table public.custom_requests
    add column if not exists counter_budget bigint check (counter_budget is null or counter_budget > 0);
  alter table public.custom_requests
    add column if not exists response_note text;
  alter table public.custom_requests
    add column if not exists countered_at timestamptz;
  alter table public.custom_requests
    add column if not exists accepted_at timestamptz;
  alter table public.custom_requests
    add column if not exists delivered_at timestamptz;
  alter table public.custom_requests
    add column if not exists disputed_at timestamptz;
exception
  when duplicate_column then null;
end $$;

alter table public.custom_requests drop constraint if exists custom_requests_status_check;
alter table public.custom_requests
  add constraint custom_requests_status_check
  check (status in (
    'pending','countered','accepted','in_progress','delivered',
    'declined','released','disputed','refunded'
  ));

create table if not exists public.custom_request_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_requests on delete cascade,
  proposer_id uuid not null references public.profiles,
  amount bigint not null check (amount > 0),
  note text,
  status text not null default 'offered'
    check (status in ('offered','accepted','rejected','superseded')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists custom_request_offers_request_idx
  on public.custom_request_offers(request_id, created_at desc);

do $$
begin
  alter table public.auctions
    add column if not exists bid_increment bigint not null default 100;
  alter table public.auctions
    add column if not exists anti_sniping_window_seconds integer not null default 120;
  alter table public.auctions
    add column if not exists anti_sniping_extension_seconds integer not null default 120;
exception
  when duplicate_column then null;
end $$;

alter table public.auctions
  drop constraint if exists auctions_bid_increment_check;
alter table public.auctions
  add constraint auctions_bid_increment_check check (bid_increment > 0);

alter table public.auctions
  drop constraint if exists auctions_anti_sniping_window_check;
alter table public.auctions
  add constraint auctions_anti_sniping_window_check
  check (anti_sniping_window_seconds between 30 and 3600);

alter table public.auctions
  drop constraint if exists auctions_anti_sniping_extension_check;
alter table public.auctions
  add constraint auctions_anti_sniping_extension_check
  check (anti_sniping_extension_seconds between 30 and 3600);

do $$
begin
  alter table public.orders
    add column if not exists shipping_ciphertext text;
  alter table public.orders
    add column if not exists shipping_nonce text;
  alter table public.orders
    add column if not exists shipping_schema_version smallint not null default 1;
  alter table public.orders
    add column if not exists discount_amount bigint not null default 0;
  alter table public.orders
    add column if not exists promotion_id uuid references public.promotions;
exception
  when duplicate_column then null;
end $$;

alter table public.orders
  drop constraint if exists orders_discount_amount_check;
alter table public.orders
  add constraint orders_discount_amount_check
  check (discount_amount >= 0);

alter table public.profiles
  add column if not exists fan_ranking_opt_out boolean not null default false;

alter table public.creator_analytics_daily
  add column if not exists new_subscribers bigint not null default 0;
alter table public.creator_analytics_daily
  add column if not exists active_subscribers bigint not null default 0;
alter table public.creator_analytics_daily
  add column if not exists followers bigint not null default 0;
alter table public.creator_analytics_daily
  add column if not exists comments bigint not null default 0;
alter table public.creator_analytics_daily
  add column if not exists reactions bigint not null default 0;

alter table public.creator_rankings_weekly
  add column if not exists score_components jsonb not null default '{}'::jsonb;

alter table public.fan_rankings_weekly
  add column if not exists channel_id uuid references public.channels on delete cascade;

create index if not exists creator_rankings_weekly_channel_idx
  on public.creator_rankings_weekly(week_start, channel_id, rank);
create unique index if not exists fan_rankings_weekly_channel_user_uidx
  on public.fan_rankings_weekly(week_start, channel_id, user_id)
  where channel_id is not null;

alter table public.user_badges
  add column if not exists source text not null default 'earned';
alter table public.user_badges
  drop constraint if exists user_badges_source_check;
alter table public.user_badges
  add constraint user_badges_source_check check (source in ('earned','purchased'));

alter table public.badges
  add column if not exists price bigint;
alter table public.badges
  drop constraint if exists badges_price_check;
alter table public.badges
  add constraint badges_price_check check (price is null or price > 0);

alter table public.missions
  add column if not exists requires_spend boolean not null default false;
alter table public.missions
  drop constraint if exists missions_no_spend_check;
alter table public.missions
  add constraint missions_no_spend_check check (requires_spend = false);

create table if not exists public.fan_tags (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique(channel_id, name)
);

create table if not exists public.fan_tag_assignments (
  tag_id uuid not null references public.fan_tags on delete cascade,
  fan_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(tag_id, fan_id)
);

create table if not exists public.premium_features (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_key text not null,
  description_key text not null,
  price bigint not null check (price > 0),
  duration_days integer not null check (duration_days > 0),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_premium_features (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  feature_id uuid not null references public.premium_features on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active','expired','cancelled')),
  txn_id uuid not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists user_premium_features_active_uidx
  on public.user_premium_features(user_id, feature_id)
  where status = 'active';

create table if not exists public.featured_channels (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  placement text not null default 'discovery'
    check (placement in ('discovery','home','search')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active','expired','cancelled')),
  approved_by uuid references public.profiles,
  source text not null default 'admin'
    check (source in ('admin','premium')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists featured_channels_active_idx
  on public.featured_channels(placement, starts_at, ends_at)
  where status='active';

do $$
begin
  alter table public.channels
    add column if not exists agency_id uuid references public.agencies;
exception
  when undefined_table then
    null;
end $$;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  status text not null default 'pending'
    check (status in ('pending','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.channels
    add constraint channels_agency_fk
    foreign key (agency_id) references public.agencies on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

create table if not exists public.agency_members (
  agency_id uuid not null references public.agencies on delete cascade,
  creator_id uuid not null references public.profiles on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','active','declined','left','suspended')),
  permissions jsonb not null default '{"analytics":true,"content":false}'::jsonb,
  commission_rate_bps integer not null default 0
    check (commission_rate_bps between 0 and 10000),
  consent_at timestamptz,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  left_at timestamptz,
  primary key (agency_id, creator_id)
);

create table if not exists public.channel_embeddings (
  channel_id uuid primary key references public.channels on delete cascade,
  embedding jsonb,
  source text,
  model text,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_recommendation_profiles (
  user_id uuid primary key references public.profiles on delete cascade,
  embedding jsonb,
  source text,
  model text,
  updated_at timestamptz not null default now()
);

create table if not exists public.recommendation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  channel_id uuid references public.channels on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_user_idx
  on public.recommendation_events(user_id, created_at desc);

insert into public.platform_settings(key,value)
values
  ('feature_flags.custom_requests','true'::jsonb),
  ('feature_flags.auctions','true'::jsonb),
  ('feature_flags.bundles','true'::jsonb),
  ('feature_flags.promotions','true'::jsonb),
  ('feature_flags.gifts','true'::jsonb),
  ('feature_flags.store','true'::jsonb),
  ('feature_flags.giveaways','true'::jsonb),
  ('feature_flags.loyalty','true'::jsonb),
  ('feature_flags.fan_ranking','true'::jsonb),
  ('feature_flags.creator_analytics','true'::jsonb),
  ('feature_flags.fan_crm','true'::jsonb),
  ('feature_flags.goals','true'::jsonb),
  ('feature_flags.referral','false'::jsonb),
  ('feature_flags.agency','false'::jsonb),
  ('feature_flags.premium','true'::jsonb),
  ('feature_flags.featured_creators','true'::jsonb),
  ('feature_flags.recommendations','true'::jsonb),
  ('feature_flags.translation','false'::jsonb),
  ('feature_flags.ai_response_assistant','false'::jsonb),
  ('feature_flags.auto_captions','false'::jsonb),
  ('feature_flags.face_blur','false'::jsonb),
  ('feature_flags.advanced_media_processing','false'::jsonb),
  ('business.shipping_encryption_version','1'::jsonb),
  ('loyalty.configured','false'::jsonb),
  ('referral.enabled','false'::jsonb)
on conflict (key) do nothing;

insert into public.premium_features(code,name_key,description_key,price,duration_days,active)
values
  ('premium_client','premium.features.client.name','premium.features.client.description',50000,30,false),
  ('featured_creator','premium.features.featured.name','premium.features.featured.description',100000,30,false)
on conflict (code) do nothing;

create index if not exists custom_requests_client_idx
  on public.custom_requests(client_id, created_at desc);
create index if not exists custom_requests_channel_idx
  on public.custom_requests(channel_id, status, created_at desc);
create index if not exists auctions_channel_status_idx
  on public.auctions(channel_id, status, ends_at);
create index if not exists bids_auction_amount_idx
  on public.bids(auction_id, amount desc, created_at desc);
create index if not exists bundles_channel_status_idx
  on public.bundles(channel_id, status, created_at desc);
create index if not exists orders_buyer_idx
  on public.orders(buyer_id, created_at desc);
create index if not exists orders_channel_idx
  on public.orders(channel_id, status, created_at desc);
create index if not exists agency_members_creator_idx
  on public.agency_members(creator_id, status);
create index if not exists fan_notes_channel_fan_idx
  on public.fan_notes(channel_id, fan_id, created_at desc);
create index if not exists creator_analytics_daily_channel_day_idx
  on public.creator_analytics_daily(channel_id, day desc);
