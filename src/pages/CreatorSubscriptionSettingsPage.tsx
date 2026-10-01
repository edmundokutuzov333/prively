import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Crown, GearSix } from '@phosphor-icons/react';
import { z } from 'zod';
import { Botao } from '@/design/Botao';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';
import { requireSupabase } from '@/lib/supabase';
import { formatMznFromCents } from '@/lib/money';
import { platformErrorKey } from '@/lib/errors';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';

type Channel = { id: string; display_name: string; handle: string };
type Tier = {
  id: string;
  channel_id: string;
  name: 'Bronze' | 'Prata' | 'Ouro' | 'VIP';
  rank: number;
  price_month: number;
  discounts: Record<string, number>;
};

const tierSchema = z.object({
  channelId: z.string().uuid(),
  rank: z.coerce.number().int().min(1).max(4),
  priceMt: z.coerce.number().finite().positive(),
  discount3: z.coerce.number().finite().min(0).max(90),
  discount6: z.coerce.number().finite().min(0).max(90),
  discount12: z.coerce.number().finite().min(0).max(90),
});

const rankNames: Record<number, Tier['name']> = {
  1: 'Bronze',
  2: 'Prata',
  3: 'Ouro',
  4: 'VIP',
};

export function CreatorSubscriptionSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [channelId, setChannelId] = useState('');
  const [rank, setRank] = useState(1);
  const [priceMt, setPriceMt] = useState('');
  const [discount3, setDiscount3] = useState('15');
  const [discount6, setDiscount6] = useState('25');
  const [discount12, setDiscount12] = useState('40');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const channelResult = await sb
        .from('channels')
        .select('id,display_name,handle')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true });
      if (channelResult.error) throw channelResult.error;

      const nextChannels = (channelResult.data ?? []) as Channel[];
      setChannels(nextChannels);
      const nextChannelId = channelId && nextChannels.some((channel) => channel.id === channelId)
        ? channelId
        : nextChannels[0]?.id ?? '';
      setChannelId(nextChannelId);

    } catch (value: unknown) {
      setError(platformErrorKey(value));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  useEffect(() => {
    const loadTiers = async () => {
      if (!channelId) {
        setTiers([]);
        return;
      }
      try {
        const result = await requireSupabase()
          .from('subscription_tiers')
          .select('id,channel_id,name,rank,price_month,discounts')
          .eq('channel_id', channelId)
          .order('rank', { ascending: true });
        if (result.error) throw result.error;
        setTiers((result.data ?? []) as Tier[]);
      } catch (value: unknown) {
        setError(platformErrorKey(value));
      }
    };
    void loadTiers();
  }, [channelId]);

  const selectedTier = useMemo(
    () => tiers.find((tier) => tier.rank === rank) ?? null,
    [tiers, rank],
  );

  useEffect(() => {
    if (selectedTier) {
      setPriceMt((selectedTier.price_month / 100).toFixed(2));
      setDiscount3(String(Math.round((selectedTier.discounts?.['3'] ?? 0) * 100)));
      setDiscount6(String(Math.round((selectedTier.discounts?.['6'] ?? 0) * 100)));
      setDiscount12(String(Math.round((selectedTier.discounts?.['12'] ?? 0) * 100)));
    } else {
      setPriceMt('');
      setDiscount3('15');
      setDiscount6('25');
      setDiscount12('40');
    }
  }, [selectedTier]);

  useEffect(() => {
    setNotice(null);
  }, [channelId, rank]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const values = tierSchema.parse({
        channelId,
        rank,
        priceMt,
        discount3,
        discount6,
        discount12,
      });

      const result = await requireSupabase().rpc('upsert_subscription_tier', {
        _channel: values.channelId,
        _name: rankNames[values.rank],
        _rank: values.rank,
        _price_month: Math.round(values.priceMt * 100),
        _discounts: {
          '1': 0,
          '3': values.discount3 / 100,
          '6': values.discount6 / 100,
          '12': values.discount12 / 100,
        },
      });

      if (result.error) throw result.error;

      setNotice(t('phase3Advanced.tierManager.saved'));
      await load();
    } catch (value: unknown) {
      setError(platformErrorKey(value));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageFrame icon={GearSix} title={t('phase3Advanced.tierManager.title')} intro={t('phase3Advanced.tierManager.intro')}>
        <p className="text-sm text-bone-500">{t('common.loading')}</p>
      </PageFrame>
    );
  }

  if (!channels.length) {
    return (
      <PageFrame icon={GearSix} title={t('phase3Advanced.tierManager.title')} intro={t('phase3Advanced.tierManager.intro')}>
        <EstadoVazio
          title={t('phase3Advanced.tierManager.noChannel')}
          body={t('phase3Advanced.tierManager.noChannelBody')}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      icon={GearSix}
      title={t('phase3Advanced.tierManager.title')}
      intro={t('phase3Advanced.tierManager.intro')}
    >
      {error ? <p role="alert" className="text-sm text-danger">{t(error)}</p> : null}
      {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <Ficha variant="focus">
          <div className="flex items-center gap-3">
            <Crown size={22} weight="duotone" className="text-crimson-400" />
            <div>
              <p className="text-lg text-bone-50">{t('phase3Advanced.tierManager.formTitle')}</p>
              <p className="text-sm text-bone-500">{t('phase3Advanced.tierManager.formBody')}</p>
            </div>
          </div>

          <form onSubmit={save} className="mt-6 space-y-4">
            <label className="block text-sm text-bone-300">
              {t('phase3Advanced.tierManager.channel')}
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50"
              >
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.display_name} · @{channel.handle}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-bone-300">
              {t('phase3Advanced.tierManager.tier')}
              <select
                value={rank}
                onChange={(event) => setRank(Number(event.target.value))}
                className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50"
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>{rankNames[value]}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-bone-300">
              {t('phase3Advanced.tierManager.price')}
              <input
                value={priceMt}
                onChange={(event) => setPriceMt(event.target.value)}
                required
                inputMode="decimal"
                placeholder="0,00"
                className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-sm text-bone-300">
                3 {t('phase3Advanced.tierManager.months')}
                <input value={discount3} onChange={(event) => setDiscount3(event.target.value)} inputMode="numeric" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" />
              </label>
              <label className="block text-sm text-bone-300">
                6 {t('phase3Advanced.tierManager.months')}
                <input value={discount6} onChange={(event) => setDiscount6(event.target.value)} inputMode="numeric" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" />
              </label>
              <label className="block text-sm text-bone-300">
                12 {t('phase3Advanced.tierManager.months')}
                <input value={discount12} onChange={(event) => setDiscount12(event.target.value)} inputMode="numeric" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" />
              </label>
            </div>

            <p className="text-xs leading-5 text-bone-500">{t('phase3Advanced.tierManager.discountHelp')}</p>
            <Botao type="submit" loading={saving}>{t('phase3Advanced.tierManager.save')}</Botao>
          </form>
        </Ficha>

        <div className="space-y-4">
          {tiers.map((tier) => (
            <Ficha key={tier.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-bone-500">{t('phase3Advanced.tierManager.rank')} {tier.rank}</p>
                  <p className="mt-2 text-2xl text-bone-50">{tier.name}</p>
                </div>
                <p className="font-display text-2xl text-bone-50">{formatMznFromCents(tier.price_month)}</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-bone-400">
                <span>3m · {Math.round((tier.discounts?.['3'] ?? 0) * 100)}%</span>
                <span>6m · {Math.round((tier.discounts?.['6'] ?? 0) * 100)}%</span>
                <span>12m · {Math.round((tier.discounts?.['12'] ?? 0) * 100)}%</span>
              </div>
            </Ficha>
          ))}
          {!tiers.length ? (
            <EstadoVazio
              title={t('phase3Advanced.tierManager.emptyTitle')}
              body={t('phase3Advanced.tierManager.emptyBody')}
            />
          ) : null}
        </div>
      </div>
    </PageFrame>
  );
}
