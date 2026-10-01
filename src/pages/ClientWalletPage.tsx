import { Wallet } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { Ficha } from '@/design/Ficha';
import { Escudo } from '@/design/Escudo';
import { Selo } from '@/design/Selo';
import { formatMznFromCents } from '@/lib/money';

type Balance = {
  account: 'wallet' | 'creator_pending' | 'creator_available' | 'escrow' | 'platform_revenue' | 'external';
  balance: number;
};

const accountLabels: Record<string, string> = {
  wallet: 'Saldo para gastar',
  creator_pending: 'Pendente (72h)',
  creator_available: 'Pronto a levantar',
  escrow: 'Em caução',
  platform_revenue: 'Receita da plataforma',
  external: 'Externo',
};

export function ClientWalletPage() {
  const { t } = useTranslation();
  const { user, configured } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !configured) {
      setLoading(false);
      return;
    }

    let active = true;
    const sb = requireSupabase();

    const loadBalances = async () => {
      try {
        const { data, error: err } = await sb.rpc('get_my_balances');
        if (err) {
          console.error('Error loading balances:', err);
          if (active) setError(t('wallet.loadError'));
          return;
        }
        if (active) setBalances((data ?? []) as Balance[]);
      } catch (e) {
        console.error('Exception loading balances:', e);
        if (active) setError(t('wallet.loadError'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadBalances();

    // Subscribe to balance changes via Realtime
    const subscription = sb
      .channel('balances')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `owner_id=eq.${user.id}` },
        (payload) => {
          if (active) {
            void loadBalances();
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      void sb.removeChannel(subscription);
    };
  }, [user, configured, t]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <Ficha variant="focus" className="p-8 text-center">
          <p className="text-sm text-bone-500">{t('experience.session.unconfigured')}</p>
        </Ficha>
      </div>
    );
  }

  return (
    <>
      <Ficha variant="focus" className="mx-auto max-w-6xl p-6 md:p-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm text-bone-500">
              <Wallet size={19} weight="duotone" />
              {t('experience.pages.wallet.intro')}
            </p>
            <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">
              {loading ? t('common.loading') : formatMznFromCents(balances.find(b => b.account === 'wallet')?.balance ?? 0)}
            </h1>
          </div>
          <Selo />
        </div>
        <div className="mt-10">
          <Escudo text={t('experience.pages.wallet.notice')} />
        </div>
      </Ficha>

      {error ? (
        <div className="mx-auto mt-4 max-w-6xl rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mx-auto mt-6 max-w-6xl px-5 text-center text-sm text-bone-500">
          {t('common.loading')}
        </div>
      ) : balances.length > 0 ? (
        <div className="mx-auto mt-6 max-w-6xl px-5 md:px-8">
          <Ficha className="overflow-hidden">
            <div className="divide-y divide-bone-50/10">
              {balances.map((b) => (
                <div key={b.account} className="flex items-center justify-between px-6 py-4">
                  <span className="text-sm text-bone-300">{accountLabels[b.account] || b.account}</span>
                  <span className="font-mono text-sm font-semibold text-bone-50">
                    {formatMznFromCents(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          </Ficha>
        </div>
      ) : null}
    </>
  );
}
