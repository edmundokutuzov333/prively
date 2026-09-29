import { useQuery } from '@tanstack/react-query';
import { featureFlags } from '@/config/featureFlags';
import { requireSupabase } from '@/lib/supabase';

const serverKeyByClientKey: Record<string, keyof typeof featureFlags> = {
  messaging: 'messaging', push: 'push', translation: 'translation', live: 'live', private_calls: 'live',
  meetings: 'meetings', moderation: 'moderation', ai_moderation: 'aiModeration', safety_alerts: 'safetyAlerts', dmca: 'dmca',
  agency: 'agency', custom_requests: 'customRequests', auctions: 'auctions', bundles: 'bundles', promotions: 'promotions',
  gifts: 'gifts', store: 'store', giveaways: 'giveaways', loyalty: 'loyalty', fan_ranking: 'fanRanking',
  creator_analytics: 'creatorAnalytics', fan_crm: 'fanCrm', goals: 'creatorGoals', referral: 'referral', premium: 'premiumFeatures',
  featured_creators: 'featuredCreators', recommendations: 'recommendations', ai_response_assistant: 'aiResponseAssistant',
  auto_captions: 'autoCaptions', face_blur: 'faceBlur', advanced_media_processing: 'advancedMediaProcessing',
};

type PublicFlag = { key: string; enabled: boolean };

async function loadPublicFlags(): Promise<PublicFlag[]> {
  const { data, error } = await requireSupabase().rpc('get_public_feature_flags');
  if (error) throw error;
  return (data ?? []) as PublicFlag[];
}

export function useFeatureFlags() {
  const query = useQuery({
    queryKey: ['public-feature-flags'],
    queryFn: loadPublicFlags,
    staleTime: 60_000,
  });
  const resolved: Record<keyof typeof featureFlags, boolean> = { ...featureFlags };
  for (const row of query.data ?? []) {
    const clientKey = serverKeyByClientKey[row.key];
    if (clientKey) resolved[clientKey] = row.enabled;
  }
  return { ...query, flags: resolved };
}

export { serverKeyByClientKey };
