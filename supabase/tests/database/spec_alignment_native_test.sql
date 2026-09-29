-- Definitive specification alignment contract.
-- Read-only native SQL checks mapped to Annex A and the four delivery phases.
-- This test validates server-side contracts only. External providers remain
-- launch blockers until their credentials and validation are complete.

with
required_tables(name, feature) as (
  values
    ('profiles','identity'),
    ('user_roles','identity'),
    ('legal_acceptances','consent'),
    ('consent_records','consent'),
    ('kyc_verifications','kyc'),
    ('channels','profiles'),
    ('posts','content'),
    ('media_assets','content'),
    ('media_consents','content'),
    ('follows','social'),
    ('comments','social'),
    ('reactions','social'),
    ('polls','social'),
    ('wishlist','social'),
    ('blocks','safety'),
    ('mutes','safety'),
    ('hidden_from','safety'),
    ('subscriptions','subscriptions'),
    ('subscription_tiers','subscriptions'),
    ('ppv_purchases','ppv'),
    ('tips','tips'),
    ('gifts_catalog','gifts'),
    ('gifts_sent','gifts'),
    ('custom_requests','custom_requests'),
    ('custom_request_offers','custom_requests'),
    ('escrow_records','escrow'),
    ('auctions','auctions'),
    ('bids','auctions'),
    ('bundles','bundles'),
    ('bundle_items','bundles'),
    ('promotions','promotions'),
    ('promotion_redemptions','promotions'),
    ('giveaways','giveaways'),
    ('giveaway_entries','giveaways'),
    ('products','store'),
    ('orders','store'),
    ('order_items','store'),
    ('conversations','chat'),
    ('conversation_members','chat'),
    ('messages','chat'),
    ('message_locked_content','chat'),
    ('message_unlocks','chat'),
    ('message_translations','translation'),
    ('auto_replies','auto_replies'),
    ('notifications','notifications'),
    ('push_subscriptions','push'),
    ('live_sessions','live'),
    ('live_tickets','live'),
    ('call_sessions','calls'),
    ('availability_slots','meetings'),
    ('meeting_requests','meetings'),
    ('safe_venues','meetings'),
    ('safety_checkins','safety'),
    ('panic_events','safety'),
    ('trusted_contacts','safety'),
    ('reports','moderation'),
    ('moderation_queue','moderation'),
    ('moderation_actions','moderation'),
    ('moderation_scans','moderation'),
    ('appeals','moderation'),
    ('compliance_objects','compliance'),
    ('compliance_access_requests','compliance'),
    ('admin_access_log','compliance'),
    ('dmca_requests','dmca'),
    ('legal_holds','legal_holds'),
    ('audit_log','audit'),
    ('watermark_policies','watermark'),
    ('watermark_events','watermark'),
    ('media_processing_jobs','advanced_media'),
    ('media_access_logs','media_access'),
    ('analytics_events','analytics'),
    ('recommendation_events','recommendations'),
    ('user_recommendation_profiles','recommendations'),
    ('channel_embeddings','recommendations'),
    ('creator_analytics_daily','creator_analytics'),
    ('fan_notes','fan_crm'),
    ('fan_tags','fan_crm'),
    ('fan_tag_assignments','fan_crm'),
    ('creator_goals','goals'),
    ('referral_codes','referral'),
    ('referrals','referral'),
    ('agencies','agency'),
    ('agency_members','agency'),
    ('support_tickets','support'),
    ('loyalty_points','loyalty'),
    ('point_events','loyalty'),
    ('missions','loyalty'),
    ('mission_progress','loyalty'),
    ('streaks','loyalty'),
    ('badges','loyalty'),
    ('user_badges','loyalty'),
    ('premium_features','premium'),
    ('user_premium_features','premium'),
    ('featured_channels','featured'),
    ('balances','finance'),
    ('ledger_entries','finance'),
    ('topups','finance'),
    ('payouts','finance'),
    ('payment_webhook_events','finance'),
    ('financial_reconciliation_runs','finance'),
    ('financial_audit_log','finance'),
    ('fx_rates','finance'),
    ('receipts','finance'),
    ('invoices','finance'),
    ('spend_limits','spend_controls'),
    ('self_exclusions','spend_controls'),
    ('security_rate_limits','production'),
    ('client_error_events','production'),
    ('platform_settings','configuration')
),
required_functions(name, feature) as (
  values
    ('record_consent','consent'),
    ('record_legal_acceptance','consent'),
    ('submit_kyc','kyc'),
    ('get_kyc_status','kyc'),
    ('is_age_verified','kyc'),
    ('approve_kyc','kyc'),
    ('create_creator_channel','profiles'),
    ('create_post','content'),
    ('publish_post','content'),
    ('get_creator_content','content'),
    ('can_view_post','content_access'),
    ('get_media_access','media_access'),
    ('get_media_preview','media_access'),
    ('get_media_status','media_access'),
    ('follow_channel','social'),
    ('unfollow_channel','social'),
    ('add_comment','social'),
    ('toggle_reaction','social'),
    ('cast_poll_vote','polls'),
    ('add_wishlist','wishlist'),
    ('remove_wishlist','wishlist'),
    ('subscribe','subscriptions'),
    ('subscribe_to_tier','subscriptions'),
    ('cancel_subscription','subscriptions'),
    ('purchase_ppv','ppv'),
    ('send_tip','tips'),
    ('send_gift','gifts'),
    ('create_custom_request','custom_requests'),
    ('respond_custom_request','custom_requests'),
    ('release_custom_request','custom_requests'),
    ('create_auction','auctions'),
    ('place_bid','auctions'),
    ('close_auction','auctions'),
    ('create_bundle','bundles'),
    ('buy_bundle_v2','bundles'),
    ('create_promotion','promotions'),
    ('enter_giveaway','giveaways'),
    ('draw_giveaway','giveaways'),
    ('create_product','store'),
    ('create_order_v2','store'),
    ('confirm_order','store'),
    ('create_conversation','chat'),
    ('send_message_v2','chat'),
    ('create_locked_message','chat'),
    ('unlock_message','chat'),
    ('mark_message_read','chat'),
    ('register_push_subscription','push'),
    ('create_live_session','live'),
    ('issue_live_access','live'),
    ('start_call','calls'),
    ('heartbeat_call','calls'),
    ('end_call','calls'),
    ('create_meeting_request','meetings'),
    ('respond_meeting_request','meetings'),
    ('create_safety_checkin','safety'),
    ('confirm_safety_checkin','safety'),
    ('create_panic_event','safety'),
    ('resolve_panic_event','safety'),
    ('submit_report','moderation'),
    ('submit_appeal','moderation'),
    ('claim_moderation_case','moderation'),
    ('resolve_moderation_case','moderation'),
    ('request_compliance_access','compliance'),
    ('approve_compliance_access','compliance'),
    ('compliance_read_message','compliance'),
    ('apply_legal_hold','legal_holds'),
    ('release_legal_hold','legal_holds'),
    ('record_watermark_event','watermark'),
    ('get_fan_ranking','rankings'),
    ('refresh_rankings','rankings'),
    ('get_creator_analytics','creator_analytics'),
    ('refresh_creator_analytics','creator_analytics'),
    ('get_fan_crm','fan_crm'),
    ('create_creator_goal','goals'),
    ('get_creator_goal_progress','goals'),
    ('create_referral_code','referral'),
    ('redeem_referral','referral'),
    ('create_agency','agency'),
    ('get_agency_dashboard','agency'),
    ('leave_agency','agency'),
    ('create_support_ticket','support'),
    ('get_support_queue','support'),
    ('resolve_support_ticket','support'),
    ('get_loyalty_status','loyalty'),
    ('complete_mission','loyalty'),
    ('award_badges','loyalty'),
    ('purchase_premium_feature','premium'),
    ('get_featured_channels','featured'),
    ('get_wallet_summary','finance'),
    ('create_topup_intent','finance'),
    ('request_payout','finance'),
    ('approve_payout','finance'),
    ('run_financial_reconciliation','finance'),
    ('refund_transaction','finance'),
    ('get_fx_rate','finance'),
    ('get_spend_limits','spend_controls'),
    ('set_spend_limits','spend_controls'),
    ('start_self_exclusion','spend_controls'),
    ('get_production_readiness','production'),
    ('get_health_probe','production'),
    ('recommend_channels','recommendations'),
    ('record_recommendation_event','recommendations')
),
table_checks as (
  select
    'table.' || feature || '.' || name as check_name,
    exists (
      select 1
      from information_schema.tables t
      where t.table_schema='public'
        and t.table_name=rt.name
        and t.table_type='BASE TABLE'
    ) as ok
  from required_tables rt
),
function_checks as (
  select
    'function.' || feature || '.' || name as check_name,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname=rf.name
    ) as ok
  from required_functions rf
),
security_checks as (
  select 'security.all_public_tables_rls' as check_name,
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and not c.relrowsecurity
    ) as ok
  union all
  select 'security.all_public_tables_have_policies',
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
    )
  union all
  select 'security.all_storage_buckets_private',
    not exists (select 1 from storage.buckets where public=true)
  union all
  select 'security.wallet_never_negative',
    not exists (select 1 from public.balances where balance<0)
  union all
  select 'security.launch_gate_off',
    coalesce((
      select value='false'::jsonb
      from public.platform_settings
      where key='production.launch_enabled'
    ), false)
  union all
  select 'security.live_flag_off_without_provider',
    coalesce((
      select value='false'::jsonb
      from public.platform_settings
      where key='feature_flags.live'
    ), true)
  union all
  select 'security.translation_flag_off_without_provider',
    coalesce((
      select value='false'::jsonb
      from public.platform_settings
      where key='feature_flags.translation'
    ), true)
  union all
  select 'security.push_flag_off_without_provider',
    coalesce((
      select value='false'::jsonb
      from public.platform_settings
      where key='feature_flags.push'
    ), true)
)
select check_name, ok
from (
  select * from table_checks
  union all select * from function_checks
  union all select * from security_checks
) checks
order by check_name;
