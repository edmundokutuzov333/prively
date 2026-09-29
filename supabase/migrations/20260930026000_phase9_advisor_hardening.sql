
-- Phase 9 advisor hardening: explicit client-only RLS boundaries and no anonymous RPC execution.

drop policy if exists badges_admin on public.badges;
drop policy if exists premium_features_admin on public.premium_features;
drop policy if exists featured_channels_admin on public.featured_channels;
drop policy if exists gifts_catalog_admin on public.gifts_catalog;
drop policy if exists missions_admin on public.missions;
drop policy if exists promotions_admin on public.promotions;
drop policy if exists goals_owner on public.creator_goals;
drop policy if exists analytics_daily_owner on public.creator_analytics_daily;
drop policy if exists referral_codes_own on public.referral_codes;

drop policy if exists fan_rankings_weekly_deny_direct_read on public.fan_rankings_weekly;
create policy fan_rankings_weekly_deny_direct_read
on public.fan_rankings_weekly
for select to authenticated
using (false);

drop policy if exists channel_embeddings_deny_direct_read on public.channel_embeddings;
create policy channel_embeddings_deny_direct_read
on public.channel_embeddings
for select to authenticated
using (false);

drop policy if exists user_recommendation_profiles_deny_direct_read on public.user_recommendation_profiles;
create policy user_recommendation_profiles_deny_direct_read
on public.user_recommendation_profiles
for select to authenticated
using (false);

do $$
declare
  fn record;
  user_functions text[] := array[
    'create_promotion','set_promotion_active',
    'create_custom_request','respond_custom_request','update_custom_request','accept_custom_request_counter','dispute_custom_request',
    'create_auction','create_auction_v2','place_bid','buy_bundle','buy_bundle_v2',
    'create_bundle','create_product','update_product','create_order_v2','dispute_order',
    'record_login','complete_mission','purchase_badge',
    'get_fan_ranking','get_creator_analytics','get_fan_crm','add_fan_note','create_fan_tag','assign_fan_tag',
    'create_creator_goal','update_goal_progress',
    'create_referral_code','redeem_referral',
    'create_agency','invite_agency_creator','accept_agency_invite','leave_agency','get_agency_dashboard',
    'purchase_premium_feature','recommend_channels','record_recommendation_event',
    'get_featured_channels',
    'create_giveaway','enter_giveaway','draw_giveaway',
    'create_bundle','send_gift','send_tip','purchase_ppv'
  ];
begin
  for fn in
    select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(user_functions)
  loop
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',fn.proname,fn.args);
    execute format('grant execute on function public.%I(%s) to authenticated',fn.proname,fn.args);
  end loop;
end
$$;

do $$
declare
  fn record;
  internal_functions text[] := array[
    '_apply_promotion','_spend_on_channel','_hold_escrow','_release_escrow',
    'release_due_business_escrows','draw_due_giveaways','refresh_rankings',
    'refresh_creator_analytics','expire_premium_features','award_badges'
  ];
begin
  for fn in
    select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(internal_functions)
  loop
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',fn.proname,fn.args);
    execute format('grant execute on function public.%I(%s) to service_role',fn.proname,fn.args);
  end loop;
end
$$;

do $$
declare
  fn record;
  admin_functions text[] := array[
    'create_featured_channel_admin','create_premium_feature','approve_agency'
  ];
begin
  for fn in
    select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(admin_functions)
  loop
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',fn.proname,fn.args);
    execute format('grant execute on function public.%I(%s) to authenticated',fn.proname,fn.args);
  end loop;
end
$$;

