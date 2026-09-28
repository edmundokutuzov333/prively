import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bank, Cardholder, CheckCircle, Clock, FilePdf, LockKey, Money, Receipt, ShieldCheck, Wallet, XCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { PageFrame } from '@/pages/PageFrame';
import { formatMznFromCents } from '@/lib/money';
import { requireSupabase, supabase } from '@/lib/supabase';

type WalletSummary = {
  wallet: number;
  pending: number;
  available: number;
};

type FinanceSettings = {
  payout_min_centavos: number;
  hold_hours: number;
  payment_methods: Record<string, boolean>;
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
    missing_env:PAYSUITE_CREATE_CHARGE_URL: 'O fornecedor de pagamentos ainda não está configurado.',
    provider_invalid_response: 'O fornecedor de pagamentos devolveu uma resposta inválida.',
    provider_amount_mismatch: 'O valor confirmado pelo fornecedor não corresponde ao valor solicitado.',
    unsupported_payment_method: 'Este método de pagamento não está disponível.',
  };
  return known[code] ?? code;
}

async function invokeEdge<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const [wallet, config, topupRows, receiptRows] = await Promise.all([
      supabase.rpc('get_wallet_summary'),
      supabase.rpc('get_financial_settings'),
      supabase.from('topups')
        .select('id,amount,method,status,internal_reference,provider_checkout_url,requested_at,paid_at,expires_at')
        .order('requested_at', { ascending: false })
        .limit(12),
      supabase.from('receipts')
        .select('id,receipt_number,txn_id,kind,amount,currency,created_at')
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (wallet.error) throw wallet.error;
    if (config.error) throw config.error;
    if (topupRows.error) throw topupRows.error;
    if (receiptRows.error) throw receiptRows.error;

    setSummary(wallet.data as WalletSummary);
    setSettings(config.data as FinanceSettings);
    setTopups((topupRows.data ?? []) as Topup[]);
    setReceipts((receiptRows.data ?? []) as ReceiptRow[]);
    const availableMethods = Object.entries((config.data as FinanceSettings).payment_methods)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (availableMethods[0] && !availableMethods.includes(method)) {
      setMethod(availableMethods[0]);
    }
  };

  useEffect(() => {
    void load().catch((e: unknown) => setError(phase6Error(e)));
  }, []);

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
      setSuccess(`Recarga ${result.reference} criada. Estado: ${result.status}.`);
      await load();
    } catch (e: unknown) {
      setError(phase6Error(e));
    } finally {
      setBusy(false);
    }
  };

  return <PageFrame icon={Wallet} title="Carteira" intro="Saldo, recargas e histórico financeiro reais.">
    <div className="mx-auto max-w-6xl space-y-5">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {success ? <p role="status" className="text-sm text-emerald-400">{success}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Ficha variant="focus" className="p-6">
          <p className="text-sm text-bone-500">Saldo disponível para gastar</p>
          <p className="mt-3 font-display text-4xl text-bone-50">{summary ? formatMznFromCents(summary.wallet) : '...'}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">Ganhos pendentes</p>
          <p className="mt-3 font-display text-4xl text-bone-50">{summary ? formatMznFromCents(summary.pending) : '...'}</p>
          <p className="mt-2 text-xs text-bone-500">{settings ? `Libertação padrão após ${settings.hold_hours} horas.` : ''}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">Ganhos disponíveis</p>
          <p className="mt-3 font-display text-4xl text-bone-50">{summary ? formatMznFromCents(summary.available) : '...'}</p>
        </Ficha>
      </div>

      <Ficha className="p-6">
        <div className="flex items-start gap-3">
          <ArrowDownLeft size={22} weight="duotone" className="text-crimson-400" />
          <div>
            <h2 className="text-lg text-bone-50">Carregar carteira</h2>
            <p className="mt-1 text-sm text-bone-500">O valor é confirmado pelo fornecedor antes de entrar no livro-razão.</p>
          </div>
        </div>
        <form onSubmit={topup} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="space-y-2 text-sm text-bone-300">
            <span>Valor em MT</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" min="1" step="0.01" required className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" />
          </label>
          <label className="space-y-2 text-sm text-bone-300">
            <span>Método</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">
              {Object.entries(settings?.payment_methods ?? { mpesa: true, emola: true, mkesh: true, ponto24: true, card: false })
                .filter(([, enabled]) => enabled)
                .map(([key]) => <option key={key} value={key}>{key === 'mpesa' ? 'M-Pesa' : key === 'emola' ? 'e-Mola' : key === 'mkesh' ? 'mKesh' : key === 'ponto24' ? 'Ponto24' : 'Cartão'}</option>)}
            </select>
          </label>
          <Botao type="submit" loading={busy}>Carregar carteira</Botao>
        </form>
      </Ficha>

      <Ficha className="p-6">
        <div className="flex items-center gap-3"><Receipt size={22} weight="duotone" /><h2 className="text-lg text-bone-50">Movimentos de recarga</h2></div>
        <div className="mt-4 space-y-2">
          {topups.map((row) => <div key={row.id} className="flex flex-col gap-2 rounded-control border border-bone-50/8 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-bone-50">{row.internal_reference}</p>
              <p className="mt-1 text-xs text-bone-500">{row.method} · {new Date(row.requested_at).toLocaleString('pt-PT')}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-display text-xl text-bone-50">{formatMznFromCents(row.amount)}</p>
              <p className="mt-1 text-xs text-bone-400">{row.status}</p>
            </div>
            {row.provider_checkout_url ? <a href={row.provider_checkout_url} target="_blank" rel="noreferrer" className="text-sm text-crimson-300 no-underline">Continuar pagamento</a> : null}
          </div>)}
          {!topups.length ? <EstadoVazio title="Sem recargas" body="As tuas recargas reais vão aparecer aqui." /> : null}
        </div>
      </Ficha>

      <Ficha className="p-6">
        <div className="flex items-center gap-3"><Receipt size={22} weight="duotone" /><h2 className="text-lg text-bone-50">Recibos</h2></div>
        <div className="mt-4 space-y-2">
          {receipts.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-control border border-bone-50/8 p-3">
            <div>
              <p className="text-sm text-bone-50">{row.receipt_number ?? row.txn_id}</p>
              <p className="mt-1 text-xs text-bone-500">{row.kind} · {new Date(row.created_at).toLocaleString('pt-PT')}</p>
            </div>
            <p className="font-display text-xl text-bone-50">{formatMznFromCents(row.amount)}</p>
          </div>)}
          {!receipts.length ? <EstadoVazio title="Sem recibos" body="Os recibos são gerados a partir de transacções financeiras reais." /> : null}
        </div>
      </Ficha>
    </div>
  </PageFrame>;
}

export function Phase6CreatorEarningsPage() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('mpesa');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    const sb = requireSupabase();
    const [wallet, config, list] = await Promise.all([
      sb.rpc('get_wallet_summary'),
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
    setSettings(config.data as FinanceSettings);
    setPayouts((list.data ?? []) as Payout[]);
  };

  useEffect(() => {
    void load().catch((e: unknown) => setError(phase6Error(e)));
  }, []);

  const requestPayout = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const amountCents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('invalid_amount');
      if (!destination.trim()) throw new Error('destination_required');

      const payout = destination.trim().replace(/\s+/g, '');
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

  return <PageFrame icon={Money} title="Ganhos" intro="Ganhos pendentes, disponíveis e levantamentos reais.">
    <div className="mx-auto max-w-6xl space-y-5">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {success ? <p role="status" className="text-sm text-emerald-400">{success}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Ficha variant="focus" className="p-6">
          <p className="text-sm text-bone-500">Disponível para levantamento</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{summary ? formatMznFromCents(summary.available) : '...'}</p>
          <p className="mt-2 text-sm text-bone-500">{settings ? `Mínimo: ${formatMznFromCents(settings.payout_min_centavos)}` : ''}</p>
        </Ficha>
        <Ficha className="p-6">
          <p className="text-sm text-bone-500">Pendente</p>
          <p className="mt-3 font-display text-5xl text-bone-50">{summary ? formatMznFromCents(summary.pending) : '...'}</p>
          <p className="mt-2 text-sm text-bone-500">{settings ? `Libertação padrão: ${settings.hold_hours} horas.` : ''}</p>
        </Ficha>
      </div>

      <Ficha className="p-6">
        <div className="flex items-start gap-3"><ArrowUpRight size={22} weight="duotone" className="text-crimson-400" /><div><h2 className="text-lg text-bone-50">Pedir levantamento</h2><p className="mt-1 text-sm text-bone-500">Requer KYC aprovado e autenticação multifactor AAL2.</p></div></div>
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
      const {error}=await requireSupabase().rpc('reconcile_ledger');
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
