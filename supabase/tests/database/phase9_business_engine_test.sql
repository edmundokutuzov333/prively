-- Prively Fase 9 native SQL regression suite.
-- This suite checks contracts in the real Supabase database. It does not seed production data.

with expected_tables as (
  select unnest(array[
    'custom_requests','custom_request_offers','auctions','bids','bundles','bundle_items','bundle_purchases',
    'promotions','promotion_redemptions','gifts_catalog','gifts_sent','products','orders','order_items',
    'giveaways','giveaway_entries','loyalty_points','missions','mission_progress','streaks','badges','user_badges',
    'creator_rankings_weekly','fan_rankings_weekly','creator_analytics_daily','fan_notes','fan_tags',
    'fan_tag_assignments','creator_goals','referral_codes','referrals','agencies','agency_members',
    'premium_features','user_premium_features','featured_channels','recommendation_events',
    'channel_embeddings','user_recommendation_profiles'
  ]) table_name
), table_check as (
  select count(*) = (select count(*) from expected_tables) as ok
  from information_schema.tables t
  join expected_tables e on e.table_name=t.table_name
  where t.table_schema='public'
),
rls_check as (
  select bool_and(c.relrowsecurity) as ok
  from pg_class c join expected_tables e on e.table_name=c.relname
  where c.relnamespace='public'::regnamespace
),
function_check as (
  select bool_and(x.exists) as ok
  from (
    select proname, exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = fn
    )
    from unnest(array[
      'create_custom_request','respond_custom_request','accept_custom_request_counter','dispute_custom_request',
      'create_auction','create_auction_v2','place_bid','close_auction','buy_bundle','buy_bundle_v2',
      'create_product','update_product','create_order_v2','dispute_order','record_login','complete_mission',
      'purchase_badge','get_fan_ranking','refresh_rankings','refresh_creator_analytics','get_creator_analytics',
      'get_fan_crm','add_fan_note','create_fan_tag','assign_fan_tag','create_creator_goal','update_goal_progress',
      'create_promotion','set_promotion_active','purchase_premium_feature','recommend_channels',
      'record_recommendation_event','create_agency','invite_agency_creator','accept_agency_invite','leave_agency',
      'get_agency_dashboard','create_featured_channel_admin','get_featured_channels'
    ]) fn
  ) x
),
anti_sniping_check as (
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='auctions' and column_name='anti_sniping_window_seconds'
  ) and exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='auctions' and column_name='anti_sniping_extension_seconds'
  ) as ok
),
promotion_check as (
  select exists(select 1 from pg_constraint where conname='promotions_kind_value_check')
     or exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotions' and column_name='max_redemptions')
  as ok
),
custom_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='custom_requests' and column_name='counter_budget')
     and exists(select 1 from information_schema.tables where table_schema='public' and table_name='custom_request_offers')
  as ok
),
encrypted_shipping_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_ciphertext')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_nonce')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_plaintext')
  as ok
),
no_meeting_money_check as (
  select not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name in ('meeting_requests','availability_slots','safe_venues')
      and column_name in ('price','amount','commission','payment_id','escrow_id','currency')
  ) as ok
),
mission_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='missions' and column_name='requires_spend')
     and not exists(select 1 from public.missions where requires_spend=true)
  as ok
),
ranking_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='creator_rankings_weekly' and column_name='score_components')
     and not exists(
       select 1
       from public.creator_rankings_weekly
       where score_components::text ilike '%earn%'
     )
  as ok
),
fan_privacy_check as (
  select exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='fan_rankings_weekly' and policyname is null
  ) as dummy_ok
),
referral_agency_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='agency_members' and column_name='commission_rate_bps')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='fan_ranking_opt_out')
  as ok
),
media_check as (
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='media_assets' and column_name='caption_path')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='media_assets' and column_name='face_blur_path')
  as ok
),
flag_check as (
  select
    (select value from public.platform_settings where key='feature_flags.custom_requests') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.auctions') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.bundles') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.store') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.loyalty') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.creator_analytics') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.fan_crm') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.recommendations') = 'true'::jsonb
    and (select value from public.platform_settings where key='feature_flags.ai_response_assistant') = 'false'::jsonb
    and (select value from public.platform_settings where key='feature_flags.auto_captions') = 'false'::jsonb
    and (select value from public.platform_settings where key='feature_flags.face_blur') = 'false'::jsonb
  as ok
),
internal_function_check as (
  select
    exists(select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name='_spend_on_channel' and grantee='authenticated')
      = false as spend_hidden,
    exists(select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name='_hold_escrow' and grantee='authenticated')
      = false as escrow_hidden
),
meeting_function_check as (
  select
    not exists(select 1 from information_schema.columns where table_schema='public' and table_name='meeting_requests' and column_name in ('price','amount','commission','escrow_id')) as ok
),
edge_contract_check as (
  select
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_media_access') as media_access,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_order_v2') as order_rpc
)
select * from table_check
union all select * from rls_check
union all select * from function_check
union all select * from anti_sniping_check
union all select * from promotion_check
union all select * from custom_check
union all select * from encrypted_shipping_check
union all select * from no_meeting_money_check
union all select * from mission_check
union all select * from ranking_check
union all select true from fan_privacy_check
union all select * from referral_agency_check
union all select * from media_check
union all select * from flag_check
union all select spend_hidden and escrow_hidden from internal_function_check
union all select * from meeting_function_check
union all select media_access and order_rpc from edge_contract_check;
