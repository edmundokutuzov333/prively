import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, ToggleLeft, ToggleRight } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';
import { featureFlags } from '@/config/featureFlags';
import { serverKeyByClientKey } from '@/features/feature-flags/useFeatureFlags';
import { requireSupabase } from '@/lib/supabase';

const labels: Record<string, string> = {
  messaging: 'Mensagens', push: 'Push', translation: 'Tradução', live: 'Lives', meetings: 'Encontros', moderation: 'Moderação',
  aiModeration: 'Moderação IA', safetyAlerts: 'Alertas de segurança', dmca: 'DMCA', agency: 'Agências', customRequests: 'Pedidos personalizados',
  auctions: 'Leilões', bundles: 'Bundles', promotions: 'Promoções', gifts: 'Presentes', store: 'Loja', giveaways: 'Giveaways', loyalty: 'Loyalty',
  fanRanking: 'Ranking de fãs', creatorAnalytics: 'Analytics de criadoras', fanCrm: 'Fan CRM', creatorGoals: 'Metas', referral: 'Referral',
  premiumFeatures: 'Premium', featuredCreators: 'Criadoras em destaque', recommendations: 'Recomendações', aiResponseAssistant: 'Assistente IA',
  autoCaptions: 'Legendas automáticas', faceBlur: 'Face blur', advancedMediaProcessing: 'Processamento avançado de media',
  phase3Monetization: 'Monetização avançada', creatorStudio: 'Estúdio da criadora',
  phase6Financials: 'Operações financeiras', wallet: 'Carteira', payments: 'Pagamentos',
};

function readBoolean(value: unknown) { return value === true || value === 'true'; }

export function FeatureFlagsAdminPage() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: async () => {
      const { data, error: queryError } = await requireSupabase().from('platform_settings').select('key,value,updated_at').like('key', 'feature_flags.%').order('key');
      if (queryError) throw queryError;
      return ((data ?? []) as Array<{ key: string; value: unknown; updated_at: string }>).map((row) => ({ ...row, value: readBoolean(row.value) }));
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error: mutationError } = await requireSupabase().rpc('set_public_feature_flag', { _key: key, _enabled: enabled });
      if (mutationError) throw mutationError;
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['admin-feature-flags'] }); await client.invalidateQueries({ queryKey: ['public-feature-flags'] }); },
    onError: (value) => setError(value instanceof Error ? value.message : 'Não foi possível actualizar a flag.'),
  });
  const current = new Map((query.data ?? []).map((row) => [row.key.replace('feature_flags.', ''), row]));
  const entries = Object.entries(serverKeyByClientKey).filter(([key]) => key !== 'private_calls');
  return <PageFrame icon={ToggleRight} eyebrow="Control Room · Segurança" title="Feature flags" intro="As flags públicas são lidas da base de dados. Cada alteração é registada no audit log.">
    {error ? <p role="alert" className="mb-4 text-sm text-danger">{error}</p> : null}
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(([settingKey, clientKey]) => {
        const setting = current.get(settingKey);
        const enabled = setting?.value ?? featureFlags[clientKey];
        const fullKey = `feature_flags.${settingKey}`;
        return <Ficha key={settingKey}><div className="flex items-center justify-between gap-4"><div><p className="text-bone-50">{labels[clientKey] ?? clientKey}</p><p className="mt-1 text-xs text-bone-500">{fullKey} · {setting ? new Date(setting.updated_at).toLocaleString('pt-MZ') : 'valor por omissão'}</p></div><Botao type="button" variant={enabled ? 'primary' : 'outline'} loading={mutation.isPending && mutation.variables?.key === fullKey} onClick={() => mutation.mutate({ key: fullKey, enabled: !enabled })}>{enabled ? <Check size={18}/> : <ToggleLeft size={18}/>} {enabled ? 'Activa' : 'Desligada'}</Botao></div></Ficha>;
      })}
    </div>
  </PageFrame>;
}
