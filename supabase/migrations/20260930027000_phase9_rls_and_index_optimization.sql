
-- Phase 9: RLS init-plan and FK index optimization for production scale.

drop policy if exists custom_request_parties on public.custom_requests;
create policy custom_request_parties on public.custom_requests
for select to authenticated
using (
  client_id=(select auth.uid())
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists custom_request_offers_parties on public.custom_request_offers;
create policy custom_request_offers_parties on public.custom_request_offers
for select to authenticated
using (
  proposer_id=(select auth.uid())
  or exists(
    select 1 from public.custom_requests r
    where r.id=request_id
      and (r.client_id=(select auth.uid()) or is_creator_of_channel((select auth.uid()),r.channel_id))
  )
  or (select private.is_platform_admin())
);

drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions
for select to authenticated
using (
  is_age_verified((select auth.uid()))
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists bids_parties on public.bids;
create policy bids_parties on public.bids
for select to authenticated
using (
  bidder_id=(select auth.uid())
  or exists(
    select 1 from public.auctions a
    where a.id=auction_id and is_creator_of_channel((select auth.uid()),a.channel_id)
  )
  or (select private.is_platform_admin())
);

drop policy if exists bundles_read on public.bundles;
create policy bundles_read on public.bundles
for select to authenticated
using (
  is_age_verified((select auth.uid()))
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists bundle_items_read on public.bundle_items;
create policy bundle_items_read on public.bundle_items
for select to authenticated
using (
  exists(
    select 1 from public.bundles b
    where b.id=bundle_id
      and (
        is_age_verified((select auth.uid()))
        or is_creator_of_channel((select auth.uid()),b.channel_id)
        or (select private.is_platform_admin())
      )
  )
);

drop policy if exists bundle_purchases_own on public.bundle_purchases;
create policy bundle_purchases_own on public.bundle_purchases
for select to authenticated
using (
  buyer_id=(select auth.uid())
  or exists(
    select 1 from public.bundles b
    where b.id=bundle_id and is_creator_of_channel((select auth.uid()),b.channel_id)
  )
  or (select private.is_platform_admin())
);

drop policy if exists gifts_sent_parties on public.gifts_sent;
create policy gifts_sent_parties on public.gifts_sent
for select to authenticated
using (
  sender_id=(select auth.uid())
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists products_read on public.products;
create policy products_read on public.products
for select to authenticated
using (
  is_age_verified((select auth.uid()))
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists products_owner_write on public.products;
create policy products_owner_write on public.products
for update to authenticated
using (is_creator_of_channel((select auth.uid()),channel_id))
with check (is_creator_of_channel((select auth.uid()),channel_id));

drop policy if exists products_owner_insert on public.products;
create policy products_owner_insert on public.products
for insert to authenticated
with check (is_creator_of_channel((select auth.uid()),channel_id));

drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products
for delete to authenticated
using (is_creator_of_channel((select auth.uid()),channel_id));

drop policy if exists orders_parties on public.orders;
create policy orders_parties on public.orders
for select to authenticated
using (
  buyer_id=(select auth.uid())
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists order_items_parties on public.order_items;
create policy order_items_parties on public.order_items
for select to authenticated
using (
  exists(
    select 1 from public.orders o
    where o.id=order_id
      and (
        o.buyer_id=(select auth.uid())
        or is_creator_of_channel((select auth.uid()),o.channel_id)
        or (select private.is_platform_admin())
      )
  )
);

drop policy if exists giveaways_read on public.giveaways;
create policy giveaways_read on public.giveaways
for select to authenticated
using (
  is_age_verified((select auth.uid()))
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists giveaway_entries_parties on public.giveaway_entries;
create policy giveaway_entries_parties on public.giveaway_entries
for select to authenticated
using (
  user_id=(select auth.uid())
  or exists(
    select 1 from public.giveaways g
    where g.id=giveaway_id and is_creator_of_channel((select auth.uid()),g.channel_id)
  )
  or (select private.is_platform_admin())
);

drop policy if exists promotions_read on public.promotions;
create policy promotions_read on public.promotions
for select to authenticated
using (
  (
    active and starts_at<=now()
    and (ends_at is null or ends_at>now())
    and is_age_verified((select auth.uid()))
  )
  or is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists fan_tags_read on public.fan_tags;
create policy fan_tags_read on public.fan_tags
for select to authenticated
using (is_creator_of_channel((select auth.uid()),channel_id));

drop policy if exists fan_tag_assignments_read on public.fan_tag_assignments;
create policy fan_tag_assignments_read on public.fan_tag_assignments
for select to authenticated
using (
  exists(
    select 1 from public.fan_tags t
    where t.id=tag_id and is_creator_of_channel((select auth.uid()),t.channel_id)
  )
);

drop policy if exists fan_notes_read on public.fan_notes;
create policy fan_notes_read on public.fan_notes
for select to authenticated
using (is_creator_of_channel((select auth.uid()),channel_id));

drop policy if exists creator_analytics_read on public.creator_analytics_daily;
create policy creator_analytics_read on public.creator_analytics_daily
for select to authenticated
using (
  is_creator_of_channel((select auth.uid()),channel_id)
  or (select private.is_platform_admin())
);

drop policy if exists referral_codes_owner on public.referral_codes;
create policy referral_codes_owner on public.referral_codes
for select to authenticated
using (
  creator_id=(select auth.uid())
  or (select private.is_platform_admin())
);

drop policy if exists agencies_owner_read on public.agencies;
create policy agencies_owner_read on public.agencies
for select to authenticated
using (
  owner_id=(select auth.uid())
  or (select private.is_platform_admin())
);

drop policy if exists agency_members_parties on public.agency_members;
create policy agency_members_parties on public.agency_members
for select to authenticated
using (
  creator_id=(select auth.uid())
  or exists(
    select 1 from public.agencies a
    where a.id=agency_id and a.owner_id=(select auth.uid())
  )
  or (select private.is_platform_admin())
);

drop policy if exists user_premium_features_own on public.user_premium_features;
create policy user_premium_features_own on public.user_premium_features
for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_platform_admin()));

drop policy if exists featured_channels_read on public.featured_channels;
create policy featured_channels_read on public.featured_channels
for select to authenticated
using (
  (
    status='active' and starts_at<=now() and ends_at>now()
  )
  or (select private.is_platform_admin())
);

-- Targeted covering indexes for Phase 9 foreign keys and high-cardinality lookups.
create index if not exists auctions_post_id_idx on public.auctions(post_id);
create index if not exists bundle_purchases_promotion_id_idx on public.bundle_purchases(promotion_id);
create index if not exists channels_agency_id_idx on public.channels(agency_id);
create index if not exists custom_request_offers_proposer_id_idx on public.custom_request_offers(proposer_id);
create index if not exists custom_requests_delivery_post_id_idx on public.custom_requests(delivery_post_id);
create index if not exists custom_requests_escrow_id_idx on public.custom_requests(escrow_id);
create index if not exists fan_rankings_weekly_channel_id_idx on public.fan_rankings_weekly(channel_id);
create index if not exists fan_rankings_weekly_user_id_idx on public.fan_rankings_weekly(user_id);
create index if not exists giveaway_entries_user_id_idx on public.giveaway_entries(user_id);
create index if not exists giveaways_channel_id_idx on public.giveaways(channel_id);
create index if not exists mission_progress_user_id_idx on public.mission_progress(user_id);
create index if not exists mission_progress_mission_id_idx on public.mission_progress(mission_id);
create index if not exists user_badges_badge_id_idx on public.user_badges(badge_id);
create index if not exists user_premium_features_feature_id_idx on public.user_premium_features(feature_id);
create index if not exists featured_channels_channel_id_idx on public.featured_channels(channel_id);
create index if not exists recommendation_events_channel_idx on public.recommendation_events(channel_id,created_at desc);
