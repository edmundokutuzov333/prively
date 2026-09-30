-- Phase 10: remove anonymous SECURITY DEFINER access from public feature flags.
-- Public feature flags remain readable, but through invoker rights + a narrow anon RLS policy.

drop policy if exists settings_public_feature_flags on public.platform_settings;

create policy settings_public_feature_flags
on public.platform_settings
for select
to anon
using (
  key = any (array[
    'feature_flags.messaging',
    'feature_flags.push',
    'feature_flags.translation',
    'feature_flags.live',
    'feature_flags.private_calls',
    'feature_flags.meetings',
    'feature_flags.moderation',
    'feature_flags.ai_moderation',
    'feature_flags.safety_alerts',
    'feature_flags.dmca',
    'feature_flags.agency',
    'feature_flags.custom_requests',
    'feature_flags.auctions',
    'feature_flags.bundles',
    'feature_flags.promotions',
    'feature_flags.gifts',
    'feature_flags.store',
    'feature_flags.giveaways',
    'feature_flags.loyalty',
    'feature_flags.fan_ranking',
    'feature_flags.creator_analytics',
    'feature_flags.fan_crm',
    'feature_flags.goals',
    'feature_flags.referral',
    'feature_flags.premium',
    'feature_flags.featured_creators',
    'feature_flags.recommendations',
    'feature_flags.ai_response_assistant',
    'feature_flags.auto_captions',
    'feature_flags.face_blur',
    'feature_flags.advanced_media_processing',
    'feature_flags.phase3_monetization',
    'feature_flags.creator_studio',
    'feature_flags.phase6_financials',
    'feature_flags.wallet',
    'feature_flags.payments'
  ])
);

create or replace function public.get_public_feature_flags()
returns table(key text, enabled boolean)
language sql
stable
security invoker
set search_path=public, pg_temp
as $function$
  select substring(ps.key from 15), (ps.value #>> '{}')::boolean
  from public.platform_settings ps
  where ps.key = any (array[
    'feature_flags.messaging',
    'feature_flags.push',
    'feature_flags.translation',
    'feature_flags.live',
    'feature_flags.private_calls',
    'feature_flags.meetings',
    'feature_flags.moderation',
    'feature_flags.ai_moderation',
    'feature_flags.safety_alerts',
    'feature_flags.dmca',
    'feature_flags.agency',
    'feature_flags.custom_requests',
    'feature_flags.auctions',
    'feature_flags.bundles',
    'feature_flags.promotions',
    'feature_flags.gifts',
    'feature_flags.store',
    'feature_flags.giveaways',
    'feature_flags.loyalty',
    'feature_flags.fan_ranking',
    'feature_flags.creator_analytics',
    'feature_flags.fan_crm',
    'feature_flags.goals',
    'feature_flags.referral',
    'feature_flags.premium',
    'feature_flags.featured_creators',
    'feature_flags.recommendations',
    'feature_flags.ai_response_assistant',
    'feature_flags.auto_captions',
    'feature_flags.face_blur',
    'feature_flags.advanced_media_processing',
    'feature_flags.phase3_monetization',
    'feature_flags.creator_studio',
    'feature_flags.phase6_financials',
    'feature_flags.wallet',
    'feature_flags.payments'
  ])
  and jsonb_typeof(ps.value)='boolean'
  order by ps.key;
$function$;

revoke execute on function public.get_public_feature_flags() from public;
grant execute on function public.get_public_feature_flags() to anon, authenticated;
