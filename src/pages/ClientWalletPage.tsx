import { Wallet } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { Ficha } from '@/design/Ficha';
import { Escudo } from '@/design/Escudo';
import { Selo } from '@/design/Selo';
import { Botao } from '@/design/Botao';
import { formatMznFromCents } from '@/lib/money';

type Balance = {
  account: 'wallet' | 'creator_pending' | 'creator_available';
  balance: number;
};

const balanceOrder: Balance['account'][] = ['wallet', 'creator_pending', 'creator_available'];

export function ClientWalletPage() {
  const { t } = useTranslation();
  const { user, configured } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBalances = useCallback(async () => {
    if (!user || !configured) {
      setBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await requireSupabase().rpc('get_my_balances');
      if (rpcError) throw rpcError;

      const rows = ((data ?? []) as Balance[])
        .filter((row) => balanceOrder.includes(row.account))
        .sort((a, b) => balanceOrder.indexOf(a.account) - balanceOrder.indexOf(b.account));

      setBalances(rows);
    } catch {
      setError(t('wallet.loadError'));
    } finally {
      setLoading(false);
    }
  }, [configured, t, user]);

  useEffect(() => {
    void loadBalances();

    if (!user || !configured) return;

    const sb = requireSupabase();
    const channel = sb
      .channel(`balances:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `owner_id=eq.${user.id}` },
        () => {
          void loadBalances();
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [configured, loadBalances, user]);

  if (!configured) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <Ficha variant="focus" className="p-8 text-center">
          <p className="text-sm text-bone-500">{t('experience.session.unconfigured')}</p>
        </Ficha>
      </div>
    );
  }

  const wallet = balances.find((row) => row.account === 'wallet')?.balance ?? 0;

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
              {loading ? t('common.loading') : formatMznFromCents(wallet)}
            </h1>
          </div>
          <Selo />
        </div>
        <div className="mt-10">
          <Escudo text={t('experience.pages.wallet.notice')} />
        </div>
      </Ficha>

      {error ? (
        <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between gap-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span role="alert">{error}</span>
          <Botao variant="outline" type="button" onClick={() => void loadBalances()}>
            {t('common.retry')}
          </Botao>
        </div>
      ) : null}

      <div className="mx-auto mt-6 max-w-6xl px-5 md:px-8">
        <Ficha className="overflow-hidden">
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-bone-500">{t('common.loading')}</div>
          ) : (
            <div className="divide-y divide-bone-50/10">
              {balanceOrder.map((account) => {
                const row = balances.find((item) => item.account === account);
                const label = t(`wallet.accounts.${account}`);
                return (
                  <div key={account} className="flex items-center justify-between px-6 py-4">
                    <span className="text-sm text-bone-300">{label}</span>
                    <span className="font-mono text-sm font-semibold text-bone-50">
                      {formatMznFromCents(row?.balance ?? 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Ficha>
      </div>
    </>
  );
}
