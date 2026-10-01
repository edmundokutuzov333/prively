import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Bank, CheckCircle, Clock, LockKey, Money, Receipt, ShieldCheck, Wallet, XCircle } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { PageFrame } from '@/pages/PageFrame';
import { formatMznFromCents } from '@/lib/money';
import { requireSupabase, supabaseProjectRef } from '@/lib/supabase';

type WalletSummary = {
  wallet: number;
  pending: number;
  available: number;
};

type FinanceSettings = {
  payout_min_centavos: number;
  hold_hours: number;
  payment_methods: Record<string, boolean>;
  wallet_topup_enabled: boolean;
  wallet_min_topup_centavos: number;
  wallet_max_topup_centavos: number;
  wallet_daily_topup_limit_centavos: number;
};

type Topup = {
  id: string;
  amount: number;
  method: string;
  status: string;
  internal_reference: string;
  provider_checkout_url: string | null;
  requested_at: string;
  paid_at: string | null;
  expires_at: string;
};

type ReceiptRow = {
  id: string;
  receipt_number: string | null;
  txn_id: string;
  kind: string;
  amount: number;
  currency: string;
  created_at: string;
};

type Payout = {
  id: string;
  amount: number;
  method: string;
  status: string;
  destination_masked: Record<string, unknown>;
  requested_at: string;
  failure_reason: string | null;
  provider_ref: string | null;
};

type Reconciliation = {
  id: string;
  status: string;
  unbalanced_transactions: number;
  balance_mismatches: number;
  topup_mismatches: number;
  payout_mismatches: number;
  created_at: string;
};

function normalizeMozambiquePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  if (compact.startsWith('08') && compact.length === 9) return '+258' + compact.slice(1);
  if (/^8\d{8}$/.test(compact)) return '+258' + compact;
  if (/^\+2588\d{8}$/.test(compact)) return compact;
  throw new Error('invalid_phone');
}

function phase6Error(error: unknown): string {
  const code = error instanceof Error ? error.message : 'financial_error';
  const known: Record<string, string> = {
    age_not_verified: 'Conclui a verificação de identidade antes de movimentar dinheiro.',
    insufficient_funds: 'O saldo disponível não é suficiente para esta operação.',
    insufficient_available_earnings: 'Os teus ganhos disponíveis não são suficientes para este levantamento.',
    kyc_required: 'A verificação de identidade da criadora tem de estar aprovada antes do levantamento.',
    aal2_required: 'Confirma a autenticação multifactor para continuar.',
    payout_below_minimum: 'O valor está abaixo do mínimo de levantamento configurado.',
    provider_charge_failed: 'O fornecedor de pagamentos recusou a cobrança.',
    provider_payout_failed: 'O fornecedor de pagamentos recusou o levantamento.',
    financial_secret_not_configured: 'O processamento financeiro ainda não foi configurado no ambiente de produção.',
    missing_env: 'O fornecedor de pagamentos ainda não está configurado.',
    provider_invalid_response: 'O fornecedor de pagamentos devolveu uma resposta inválida.',
    provider_amount_mismatch: 'O valor confirmado pelo fornecedor não corresponde ao valor solicitado.',
    unsupported_payment_method: 'Este método de pagamento não está disponível.',
    invalid_phone: 'Introduz um número moçambicano válido para receber o levantamento.',
    invalid_mfa_code: 'Introduz o código de 6 dígitos recebido por SMS.',
    phone_confirmation_required: 'Confirma o teu número de telefone antes de pedir um levantamento.',
    financial_mfa_recent_required: 'Confirma o código de segurança para continuar com o levantamento.',
    phone_mfa_not_verified: 'Activa a confirmação por SMS antes de pedir um levantamento.',
    wallet_production_disabled: 'As recargas estão indisponíveis até o fornecedor de pagamentos estar validado.',
    topup_below_minimum: 'O valor está abaixo do mínimo de recarga configurado.',
    topup_limit_exceeded: 'O valor excede o máximo de recarga permitido.',
    topup_daily_limit_exceeded: 'Atingiste o limite diário de recargas.',
    topup_balance_limit_exceeded: 'A recarga excederia o limite máximo da carteira.',
    topup_not_payable: 'Esta recarga já não pode ser paga. Cria uma nova recarga.',
    topup_amount_missing: 'O fornecedor não enviou um valor de pagamento válido.',
    provider_unverified: 'O fornecedor de pagamentos ainda não está validado para processar recargas.',
    provider_timeout: 'O fornecedor demorou demasiado tempo a responder. Tenta novamente.',
    provider_unavailable: 'O fornecedor de pagamentos está indisponível. Tenta novamente.',
  };
  return known[code] ?? code;
}

async function invokeEdge<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

async function downloadFinancialExport(format: 'csv' | 'receipt_pdf', receiptId?: string): Promise<void> {
  const sb = requireSupabase();
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error('session_required');

  const response = await fetch(`https://${supabaseProjectRef}.supabase.co/functions/v1/financial-export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ format, receiptId }),
  });

  if (!response.ok) {
    let code = 'financial_export_failed';
    try {
      const body = await response.json() as { code?: unknown };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // Preserve the generic export failure.
    }
    throw new Error(code);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? (format === 'csv' ? 'prively-historico-financeiro.csv' : 'prively-recibo.pdf');

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function Phase6ClientWalletPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('mpesa');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = requireSupabase();
    setLoading(true);
    const [wallet, config, topupRows, receiptRows] = await Promise.all([
      sb.rpc('get_wallet_summary'),
      sb.rpc('get_financial_settings'),
      sb.from('topups')
        .select('id,amount,method,status,internal_reference,provider_checkout_url,requested_at,paid_at,expires_at')
        .order('requested_at', { ascending: false })
        .limit(12),
      sb.from('receipts')
        .select('id,receipt_number,txn_id,kind,amount,currency,created_at')
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (wallet.error) throw wallet.error;
    if (earningsSummary.error) throw earningsSummary.error;
    if (config.error) throw config.error;
    if (topupRows.error) throw topupRows.error;
    if (receiptRows.error) throw receiptRows.error;

    const nextSettings = config.data as FinanceSettings;
    setSummary(wallet.data as WalletSummary);
    setSettings(nextSettings);
    setTopups((topupRows.data ?? []) as Topup[]);
    setReceipts((receiptRows.data ?? []) as ReceiptRow[]);

    const availableMethods = Object.entries(nextSettings.payment_methods)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    if (availableMethods.length > 0 && !availableMethods.includes(method)) {
      setMethod(availableMethods[0]);
    }
  }, [method]);

  useEffect(() => {
    void load()
      .catch((e: unknown) => setError(phase6Error(e)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const sb = requireSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;

      channel = sb
        .channel(`wallet-topups-${data.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'balances',
            filter: `owner_id=eq.${data.user.id}`,
          },
          () => {
            void load();
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'topups',
            filter: `user_id=eq.${data.user.id}`,
          },
          () => {
            void load();
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void sb.removeChannel(channel);
    };
  }, [load]);

  const topup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error('invalid_amount');

      const result = await invokeEdge<{
        topupId: string;
        reference: string;
        status: string;
        checkoutUrl?: string | null;
      }>('payments-create-topup', {
        amount: value,
        method,
        idempotencyKey: crypto.randomUUID(),
      });

      setAmount('');
      setSuccess(t('phase5Topup.created', {
        reference: result.reference,
        status: topupStatusLabel(result.status, t),
      }));
      await load();
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setBusy(false);
    }
  };

  const retryTopup = async (row: Topup) => {
    if (!settings?.wallet_topup_enabled) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await invokeEdge<{
        reference: string;
        status: string;
      }>('payments-create-topup', {
        amount: row.amount / 100,
        method: row.method,
        idempotencyKey: crypto.randomUUID(),
      });

      setSuccess(t('phase5Topup.created', {
        reference: result.reference,
        status: topupStatusLabel(result.status, t),
      }));
      await load();
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setBusy(false);
    }
  };

  const paymentMethods = Object.entries(settings?.payment_methods ?? {})
    .filter(([, enabled]) => enabled);

  const retryable = new Set(['failed', 'expired', 'cancelled']);
  const topupEnabled = settings?.wallet_topup_enabled === true;

  return (
    <PageFrame icon={Wallet} title={t('experience.pages.wallet.title')} intro={t('phase5Topup.intro')}>
      <div className="mx-auto max-w-6xl space-y-5">
        {error ? (
          <div className="flex items-center justify-between gap-4 rounded-control border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <span role="alert">{error}</span>
            <Botao variant="outline" type="button" onClick={() => void load()}>{t('phase5Topup.retry')}</Botao>
          </div>
        ) : null}

        {success ? <p role="status" className="text-sm text-emerald-400">{success}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Ficha variant="focus" className="p-6">
            <p className="text-sm text-bone-500">{t('phase5Topup.balance')}</p>
            <p className="mt-3 font-display text-4xl text-bone-50">
              {loading || !summary ? '...' : formatMznFromCents(summary.wallet)}
            </p>
          </Ficha>
          <Ficha className="p-6">
            <p className="text-sm text-bone-500">{t('phase5Topup.pending')}</p>
            <p className="mt-3 font-display text-4xl text-bone-50">
              {loading || !summary ? '...' : formatMznFromCents(summary.pending)}
            </p>
          </Ficha>
          <Ficha className="p-6">
            <p className="text-sm text-bone-500">{t('phase5Topup.available')}</p>
            <p className="mt-3 font-display text-4xl text-bone-50">
              {loading || !summary ? '...' : formatMznFromCents(summary.available)}
            </p>
          </Ficha>
        </div>

        <Ficha className="p-6">
          <div className="flex items-start gap-3">
            <ArrowDownLeft size={22} weight="duotone" className="text-crimson-400" />
            <div>
              <h2 className="text-lg text-bone-50">{t('phase5Topup.formTitle')}</h2>
              <p className="mt-1 text-sm text-bone-500">{t('phase5Topup.formIntro')}</p>
            </div>
          </div>

          {!settings && loading ? (
            <p className="mt-5 text-sm text-bone-500">{t('common.loading')}</p>
          ) : !topupEnabled ? (
            <div className="mt-5 rounded-control border border-warn/30 bg-warn/5 p-4">
              <p className="text-sm text-bone-200">{t('phase5Topup.unavailable')}</p>
            </div>
          ) : (
            <form onSubmit={topup} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="space-y-2 text-sm text-bone-300">
                <span>{t('phase5Topup.amount')}</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  min={settings ? settings.wallet_min_topup_centavos / 100 : undefined}
                  max={settings ? settings.wallet_max_topup_centavos / 100 : undefined}
                  step="0.01"
                  required
                  className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50"
                />
              </label>
              <label className="space-y-2 text-sm text-bone-300">
                <span>{t('phase5Topup.method')}</span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50"
                >
                  {paymentMethods.map(([key]) => (
                    <option key={key} value={key}>
                      {key === 'mpesa' ? 'M-Pesa' : key === 'emola' ? 'e-Mola' : key === 'mkesh' ? 'mKesh' : key === 'ponto24' ? 'Ponto24' : 'Cartão'}
                    </option>
                  ))}
                </select>
              </label>
              <Botao type="submit" loading={busy}>{t('phase5Topup.submit')}</Botao>
              {settings ? (
                <p className="text-xs text-bone-500 md:col-span-3">
                  {t('phase5Topup.limits', {
                    min: formatMznFromCents(settings.wallet_min_topup_centavos),
                    max: formatMznFromCents(settings.wallet_max_topup_centavos),
                  })}
                  {' · '}
                  {t('phase5Topup.dailyLimit', {
                    limit: formatMznFromCents(settings.wallet_daily_topup_limit_centavos),
                  })}
                </p>
              ) : null}
            </form>
          )}
        </Ficha>

        <Ficha className="p-6">
          <div className="flex items-center gap-3">
            <Receipt size={22} weight="duotone" />
            <h2 className="text-lg text-bone-50">{t('phase5Topup.history')}</h2>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-bone-500">{t('common.loading')}</p>
            ) : topups.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-control border border-bone-50/8 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-bone-50">{row.internal_reference}</p>
                  <p className="mt-1 text-xs text-bone-500">
                    {row.method} · {new Date(row.requested_at).toLocaleString('pt-PT')}
                  </p>
                </div>
                <div className="flex flex-col gap-2 text-left sm:items-end sm:text-right">
                  <p className="font-display text-xl text-bone-50">{formatMznFromCents(row.amount)}</p>
                  <p className="text-xs text-bone-400">{topupStatusLabel(row.status, t)}</p>
                  <div className="flex flex-wrap gap-2">
                    {row.provider_checkout_url && row.status !== 'paid' ? (
                      <a href={row.provider_checkout_url} target="_blank" rel="noreferrer" className="text-sm text-crimson-300 no-underline">
                        {t('phase5Topup.continue')}
                      </a>
                    ) : null}
                    {topupEnabled && retryable.has(row.status) ? (
                      <Botao variant="outline" type="button" loading={busy} onClick={() => void retryTopup(row)}>
                        {t('phase5Topup.retry')}
                      </Botao>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {!loading && !topups.length ? (
              <EstadoVazio title={t('phase5Topup.historyEmptyTitle')} body={t('phase5Topup.historyEmptyBody')} />
            ) : null}
          </div>
        </Ficha>

        <Ficha className="p-6">
          <div className="flex items-center gap-3">
            <Receipt size={22} weight="duotone" />
            <h2 className="text-lg text-bone-50">Recibos</h2>
          </div>
          <div className="mt-4 space-y-2">
            {receipts.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-control border border-bone-50/8 p-3">
                <div>
                  <p className="text-sm text-bone-50">{row.receipt_number ?? row.txn_id}</p>
                  <p className="mt-1 text-xs text-bone-500">{row.kind} · {new Date(row.created_at).toLocaleString('pt-PT')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-display text-xl text-bone-50">{formatMznFromCents(row.amount)}</p>
                  <Botao variant="outline" type="button" onClick={() => void downloadFinancialExport('receipt_pdf', row.id).catch((e: unknown) => setError(phase6Error(e)))}>PDF</Botao>
                </div>
              </div>
            ))}
            {!receipts.length ? <EstadoVazio title="Sem recibos" body="Os recibos são gerados a partir de transacções financeiras reais." /> : null}
          </div>
        </Ficha>
      </div>
    </PageFrame>
  );
}

function topupStatusLabel(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const keys: Record<string, string> = {
    pending: 'phase5Topup.pendingStatus',
    processing: 'phase5Topup.processingStatus',
    paid: 'phase5Topup.paidStatus',
    failed: 'phase5Topup.failedStatus',
    expired: 'phase5Topup.expiredStatus',
    cancelled: 'phase5Topup.cancelledStatus',
    reversal_pending: 'phase5Topup.reversalPendingStatus',
    reversed: 'phase5Topup.reversedStatus',
  };

  return t(keys[status] ?? 'phase5Topup.processingStatus');
}

export function Phase6CreatorEarningsPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [earnings, setEarnings] = useState<{ gross_earned: number; requested_payouts: number } | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('mpesa');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [mfaPhoneFactorId, setMfaPhoneFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [financialMfaReady, setFinancialMfaReady] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  const loadSecurity = async () => {
    const sb = requireSupabase();
    const [{ data: userResult, error: userError }, factorsResult, aalResult] = await Promise.all([
      sb.auth.getUser(),
      sb.auth.mfa.listFactors(),
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (userError || !userResult.user) throw new Error('session_required');

    setPhoneConfirmed(Boolean(userResult.user.phone && userResult.user.phone_confirmed_at));
    const verifiedPhone = !factorsResult.error
      ? factorsResult.data.phone.find((factor) => factor.status === 'verified')
      : undefined;
    setMfaPhoneFactorId(verifiedPhone?.id ?? null);
    setFinancialMfaReady(Boolean(verifiedPhone && aalResult.data?.currentLevel === 'aal2'));
  };

  const load = async () => {
    const sb = requireSupabase();
    const [wallet, earningsSummary, config, list] = await Promise.all([
      sb.rpc('get_wallet_summary'),
      sb.rpc('get_creator_earnings_summary'),
      sb.rpc('get_financial_settings'),
      sb.from('payouts')
        .select('id,amount,method,status,destination_masked,requested_at,failure_reason,provider_ref')
        .order('requested_at', { ascending: false })
        .limit(20),
    ]);
    if (wallet.error) throw wallet.error;
    if (config.error) throw config.error;
    if (list.error) throw list.error;
    setSummary(wallet.data as WalletSummary);
    setEarnings(earningsSummary.data as { gross_earned: number; requested_payouts: number });
    setSettings(config.data as FinanceSettings);
    setPayouts((list.data ?? []) as Payout[]);
  };

  useEffect(() => {
    void Promise.all([load(), loadSecurity()]).catch((e: unknown) => setError(phase6Error(e)));
  }, []);

  const startPayoutMfa = async () => {
    setMfaBusy(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const { data: userResult, error: userError } = await sb.auth.getUser();
      if (userError || !userResult.user) throw new Error('session_required');
      if (!userResult.user.phone || !userResult.user.phone_confirmed_at) {
        throw new Error('phone_confirmation_required');
      }

      let factorId = mfaPhoneFactorId;
      if (!factorId) {
        const enrollment = await sb.auth.mfa.enroll({
          factorType: 'phone',
          friendlyName: 'Levantamentos Prively',
          phone: userResult.user.phone,
        });
        if (enrollment.error) throw enrollment.error;
        factorId = enrollment.data.id;
        setMfaPhoneFactorId(factorId);
      }

      const challenge = await sb.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      setMfaChallengeId(challenge.data.id);
      setMfaCode('');
      setSuccess('Enviámos um código de segurança por SMS.');
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setMfaBusy(false);
    }
  };

  const verifyPayoutMfa = async () => {
    if (!mfaPhoneFactorId || !mfaChallengeId || !/^\d{6}$/.test(mfaCode)) {
      setError(new Error('invalid_mfa_code').message);
      return;
    }

    setMfaBusy(true);
    setError(null);
    try {
      const result = await requireSupabase().auth.mfa.verify({
        factorId: mfaPhoneFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode,
      });
      if (result.error) throw result.error;

      await loadSecurity();
      setMfaChallengeId(null);
      setMfaCode('');
      setSuccess('Confirmação por SMS concluída. O levantamento pode continuar.');
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setMfaBusy(false);
    }
  };

  const requestPayout = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const amountCents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('invalid_amount');
      if (!destination.trim()) throw new Error('destination_required');
      if (!phoneConfirmed) throw new Error('phone_confirmation_required');
      if (!financialMfaReady) throw new Error('financial_mfa_recent_required');

      const payout = method === 'bank'
        ? destination.trim().replace(/\s+/g, '')
        : normalizeMozambiquePhone(destination);
      const destinationJson = method === 'bank'
        ? { account: payout }
        : { phone: payout };

      const { data, error: payoutError } = await requireSupabase().rpc('request_payout', {
        _amount: amountCents,
        _method: method,
        _destination: destinationJson,
        _idem: crypto.randomUUID(),
      });

      if (payoutError) throw payoutError;
      setAmount('');
      setDestination('');
      setSuccess(`Levantamento ${String(data)} criado e enviado para aprovação financeira.`);
      await load();
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setBusy(false);
    }
  };

  return <PageFrame icon={Money} title={t('phase14.earnings.title')} intro={t('phase14.earnings.intro')}>
    <div className="mx-auto max-w-6xl space-y-5">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {success ? <p role="status" className="text-sm text-emerald-400">{success}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Ficha variant="focus" className="p-6">
          <p className="text-sm text-bone-500">{t('phase14.earnings.available')}</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{summary ? formatMznFromCents(summary.available) : '...'}</p>
          <p className="mt-2 text-sm text-bone-500">{settings ? `${t('phase14.earnings.minimum')}: ${formatMznFromCents(settings.payout_min_centavos)}` : ''}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">{t('phase14.earnings.pending')}</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{summary ? formatMznFromCents(summary.pending) : '...'}</p>
          <p className="mt-2 text-sm text-bone-500">{settings ? `${t('phase14.earnings.release')}: ${settings.hold_hours} horas.` : ''}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">{t('phase14.earnings.grossEarned')}</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{earnings ? formatMznFromCents(earnings.gross_earned) : '...'}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">{t('phase14.earnings.requestedPayouts')}</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{earnings ? formatMznFromCents(earnings.requested_payouts) : '...'}</p>
        </Ficha>
      </div>

      <Ficha className="p-6">
        <div className="flex items-start gap-3"><ArrowUpRight size={22} weight="duotone" className="text-crimson-400" /><div><h2 className="text-lg text-bone-50">Pedir levantamento</h2><p className="mt-1 text-sm text-bone-500">Requer KYC aprovado, telefone confirmado e uma confirmação recente por SMS.</p></div></div>

        {!phoneConfirmed ? (
          <div className="mt-5 rounded-control border border-warn/30 bg-warn/5 p-4">
            <p className="text-sm text-bone-200">Confirma o teu número de telefone nas definições da conta antes do levantamento.</p>
          </div>
        ) : !financialMfaReady ? (
          <div className="mt-5 grid gap-3 rounded-control border border-bone-50/10 p-4">
            <p className="text-sm text-bone-300">A confirmação por SMS é exigida para cada pedido financeiro sensível.</p>
            {!mfaChallengeId ? (
              <Botao type="button" loading={mfaBusy} onClick={() => void startPayoutMfa()}>Enviar código por SMS</Botao>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Código de 6 dígitos"
                  className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50"
                />
                <Botao type="button" loading={mfaBusy} onClick={() => void verifyPayoutMfa()}>Confirmar código</Botao>
              </div>
            )}
          </div>
        ) : null}

        <form onSubmit={requestPayout} className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm text-bone-300"><span>Valor em MT</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" min="1" step="0.01" required className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" /></label>
          <label className="space-y-2 text-sm text-bone-300"><span>Método</span><select value={method} onChange={(e) => setMethod(e.target.value)} className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50"><option value="mpesa">M-Pesa</option><option value="emola">e-Mola</option><option value="mkesh">mKesh</option><option value="ponto24">Ponto24</option><option value="bank">Banco</option></select></label>
          <label className="space-y-2 text-sm text-bone-300 md:col-span-1"><span>{method === 'bank' ? 'Conta / IBAN' : 'Número de carteira móvel'}</span><input value={destination} onChange={(e) => setDestination(e.target.value)} required className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" /></label>
          <Botao type="submit" loading={busy}>Pedir levantamento</Botao>
        </form>
      </Ficha>

      <Ficha className="p-6">
        <div className="flex items-center gap-3"><Receipt size={22} weight="duotone" /><h2 className="text-lg text-bone-50">Histórico de levantamentos</h2></div>
        <div className="mt-4 space-y-2">
          {payouts.map((row) => <div key={row.id} className="flex flex-col gap-2 rounded-control border border-bone-50/8 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm text-bone-50">{row.id.slice(0, 8)}</p><p className="mt-1 text-xs text-bone-500">{row.method} · {new Date(row.requested_at).toLocaleString('pt-PT')}</p></div>
            <div className="text-left sm:text-right"><p className="font-display text-xl text-bone-50">{formatMznFromCents(row.amount)}</p><p className="mt-1 text-xs text-bone-400">{row.status}</p>{row.failure_reason ? <p className="mt-1 text-xs text-danger">{row.failure_reason}</p> : null}</div>
          </div>)}
          {!payouts.length ? <EstadoVazio title="Sem levantamentos" body="Os teus levantamentos reais aparecem aqui." /> : null}
        </div>
      </Ficha>
    </div>
  </PageFrame>;
}

export function Phase6LimitsPage() {
  const [limits, setLimits] = useState<{daily: number | null; weekly: number | null; monthly: number | null}>({daily:null,weekly:null,monthly:null});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);

  const load=async()=>{
    const {data,error}=await requireSupabase().rpc('get_spend_limits');
    if(error) throw error;
    setLimits({
      daily: typeof data?.daily==='number'?data.daily:null,
      weekly: typeof data?.weekly==='number'?data.weekly:null,
      monthly: typeof data?.monthly==='number'?data.monthly:null,
    });
  };

  useEffect(()=>{void load().catch((e:unknown)=>setError(phase6Error(e)));},[]);

  const save=async(event:FormEvent)=>{
    event.preventDefault();
    setBusy(true); setError(null); setSuccess(null);
    try{
      const daily=limits.daily;
      const weekly=limits.weekly;
      const monthly=limits.monthly;
      const {error}=await requireSupabase().rpc('set_spend_limits',{
        _daily:daily,
        _weekly:weekly,
        _monthly:monthly,
      });
      if(error) throw error;
      setSuccess('Limites actualizados.');
      await load();
    }catch(e:unknown){setError(phase6Error(e));}finally{setBusy(false);}
  };

  return <PageFrame icon={ShieldCheck} title="Limites de gasto" intro="Controla quanto podes gastar em períodos definidos.">
    <Ficha className="mx-auto max-w-3xl p-6">
      {error?<p role="alert" className="mb-4 text-sm text-danger">{error}</p>:null}
      {success?<p role="status" className="mb-4 text-sm text-emerald-400">{success}</p>:null}
      <form onSubmit={save} className="grid gap-4">
        {(['daily','weekly','monthly'] as const).map((key)=><label key={key} className="space-y-2 text-sm text-bone-300">
          <span>{key==='daily'?'Diário':key==='weekly'?'Semanal':'Mensal'} (MT)</span>
          <input value={limits[key]===null?'':String((limits[key]??0)/100)} onChange={(e)=>setLimits((current)=>({...current,[key]:e.target.value===''?null:Math.round(Number(e.target.value)*100)}))} inputMode="decimal" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" placeholder="Sem limite" />
        </label>)}
        <div className="flex items-center gap-3"><LockKey size={20}/><p className="text-sm text-bone-500">Os limites são aplicados no servidor antes de qualquer gasto elegível.</p></div>
        <Botao type="submit" loading={busy}>Guardar limites</Botao>
      </form>
    </Ficha>
  </PageFrame>;
}

export function Phase6FinanceAdminPage() {
  const [payouts,setPayouts]=useState<Payout[]>([]);
  const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);

  const load=async()=>{
    const sb=requireSupabase();
    const [payoutRows, reconciliationRows]=await Promise.all([
      sb.from('payouts').select('id,amount,method,status,destination_masked,requested_at,failure_reason,provider_ref').order('requested_at',{ascending:false}).limit(50),
      sb.from('financial_reconciliation_runs').select('id,status,unbalanced_transactions,balance_mismatches,topup_mismatches,payout_mismatches,created_at').order('created_at',{ascending:false}).limit(1),
    ]);
    if(payoutRows.error) throw payoutRows.error;
    if(reconciliationRows.error) throw reconciliationRows.error;
    setPayouts((payoutRows.data??[]) as Payout[]);
    setReconciliation(((reconciliationRows.data??[])[0] as Reconciliation|undefined)??null);
  };

  useEffect(()=>{void load().catch((e:unknown)=>setError(phase6Error(e)));},[]);

  const action=async(id:string,kind:'approve'|'reject'|'process')=>{
    setBusy(id+kind);setError(null);setSuccess(null);
    try{
      if(kind==='approve'){
        const {error}=await requireSupabase().rpc('approve_payout',{_payout:id});
        if(error) throw error;
      }else if(kind==='reject'){
        const {error}=await requireSupabase().rpc('reject_payout',{_payout:id,_reason:'Rejeitado pela equipa financeira.'});
        if(error) throw error;
      }else{
        await invokeEdge('payout-process',{payoutId:id});
      }
      setSuccess('Operação financeira concluída.');
      await load();
    }catch(e:unknown){setError(phase6Error(e));}finally{setBusy(null);}
  };

  const reconcile=async()=>{
    setBusy('reconcile');setError(null);setSuccess(null);
    try{
      const {error}=await requireSupabase().rpc('run_financial_reconciliation');
      if(error) throw error;
      setSuccess('Reconciliação executada.');
      await load();
    }catch(e:unknown){setError(phase6Error(e));}finally{setBusy(null);}
  };

  return <PageFrame icon={Bank} title="Financeiro" intro="Operações financeiras com ledger, estados de provider e reconciliação.">
    <div className="mx-auto max-w-7xl space-y-5">
      {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}
      {success?<p role="status" className="text-sm text-emerald-400">{success}</p>:null}

      <div className="grid gap-4 md:grid-cols-4">
        <Ficha className="p-5"><p className="text-xs text-bone-500">Reconciliação</p><p className="mt-2 text-lg text-bone-50">{reconciliation?.status ?? 'Ainda não executada'}</p></Ficha>
        <Ficha className="p-5"><p className="text-xs text-bone-500">Transacções desequilibradas</p><p className="mt-2 text-lg text-bone-50">{reconciliation?.unbalanced_transactions ?? 0}</p></Ficha>
        <Ficha className="p-5"><p className="text-xs text-bone-500">Saldos divergentes</p><p className="mt-2 text-lg text-bone-50">{reconciliation?.balance_mismatches ?? 0}</p></Ficha>
        <Ficha className="p-5"><Botao type="button" loading={busy==='reconcile'} onClick={()=>void reconcile()}>Reconciliar ledger</Botao></Ficha>
      </div>

      <Ficha className="p-5">
        <h2 className="text-lg text-bone-50">Levantamentos</h2>
        <div className="mt-4 space-y-2">
          {payouts.map((row)=><div key={row.id} className="flex flex-col gap-3 rounded-control border border-bone-50/8 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-bone-50">{row.id}</p>
              <p className="mt-1 text-xs text-bone-500">{row.method} · {formatMznFromCents(row.amount)} · {new Date(row.requested_at).toLocaleString('pt-PT')}</p>
              <p className="mt-1 text-xs text-bone-500">{JSON.stringify(row.destination_masked)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.status==='requested'?<><Botao type="button" loading={busy===row.id+'approve'} onClick={()=>void action(row.id,'approve')}>Aprovar</Botao><Botao variant="outline" type="button" loading={busy===row.id+'reject'} onClick={()=>void action(row.id,'reject')}>Rejeitar</Botao></>:null}
              {row.status==='approved'?<Botao type="button" loading={busy===row.id+'process'} onClick={()=>void action(row.id,'process')}>Enviar ao provider</Botao>:null}
              {row.status==='processing'?<span className="inline-flex min-h-11 items-center gap-2 rounded-control border border-bone-50/10 px-3 text-sm text-bone-300"><Clock size={18}/>Em processamento</span>:null}
              {row.status==='paid'?<span className="inline-flex min-h-11 items-center gap-2 rounded-control border border-emerald-400/30 px-3 text-sm text-emerald-300"><CheckCircle size={18}/>Pago</span>:null}
              {row.status==='failed'||row.status==='rejected'?<span className="inline-flex min-h-11 items-center gap-2 rounded-control border border-danger/40 px-3 text-sm text-danger"><XCircle size={18}/>{row.failure_reason??row.status}</span>:null}
            </div>
          </div>)}
          {!payouts.length?<EstadoVazio title="Sem levantamentos" body="Os pedidos reais de levantamento aparecem aqui."/>:null}
        </div>
      </Ficha>

      <Ficha className="p-5">
        <div className="flex items-center gap-3"><ShieldCheck size={21}/><div><p className="text-sm text-bone-50">Controlo financeiro</p><p className="mt-1 text-xs text-bone-500">Todas as operações sensíveis exigem AAL2 e ficam registadas no financial audit log.</p></div></div>
      </Ficha>
    </div>
  </PageFrame>;
}
