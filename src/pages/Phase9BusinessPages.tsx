import { useEffect, useState, type FormEvent } from 'react';
import { Auction, ChartLine, Compass, Crown, Gift, Gavel, Package, ShieldCheck, ShoppingBag, Sparkle, Tag, Target, Trophy, UserList, UsersThree } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';
import { featureFlags } from '@/config/featureFlags';
import { supabase, requireSupabase } from '@/lib/supabase';
import { phase9Edge, phase9Rpc, phase9Rows } from '@/lib/phase9Api';
import { formatMznFromCents } from '@/lib/money';
import { useAuth } from '@/app/session';

type Channel = { id: string; display_name: string; handle: string };
type RequestRow = { id: string; channel_id: string; brief: string; budget: number; status: string; counter_budget: number | null; response_note: string | null; created_at: string };
type OfferRow = { id: string; request_id: string; amount: number; note: string | null; status: string };
type AuctionRow = { id: string; channel_id: string; title: string; description: string | null; minimum_bid: number; bid_increment: number; ends_at: string; status: string };
type ProductRow = { id: string; channel_id: string; name: string; description: string | null; price: number; stock: number; active: boolean };
type BundleRow = { id: string; channel_id: string; name: string; description: string | null; price: number; expires_at: string | null; status: string };
type GiveawayRow = { id: string; channel_id: string; title: string; description: string | null; winner_count: number; starts_at: string; ends_at: string; requires_subscription: boolean; status: string };
type MissionRow = { id: string; code: string; name_key: string; description_key: string; target: number; points_reward: number; active: boolean };
type BadgeRow = { id: string; code: string; name_key: string; description_key: string; points_threshold: number | null; price: number | null; active: boolean };
type PremiumRow = { id: string; code: string; name_key: string; description_key: string; price: number; duration_days: number; active: boolean };
type FanRow = { fan_id: string; pseudonym: string; subscriptions: number; purchases: number; last_purchase_at: string | null; last_message_at: string | null };
type AnalyticsRow = { day: string; views: number; unique_viewers: number; messages: number; sales: number; gross_amount: number; tips: number; live_minutes: number; new_subscribers: number; active_subscribers: number; followers: number; comments: number; reactions: number };

function ErrorBox({ message }: { message: string | null }) {
  return message ? <p role="alert" className="mt-4 text-sm text-danger">{message}</p> : null;
}

function LoadingLine() {
  return <div className="h-px w-24 animate-pulse bg-crimson-500/60" aria-label="A carregar" />;
}

function BusinessDisabled({ title, body }: { title: string; body: string }) {
  return <PageFrame icon={ShieldCheck} title={title} intro={body}><Ficha><EstadoVazio title="Funcionalidade não disponível" body={body} /></Ficha></PageFrame>;
}

export function Phase9ClientRequestsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [channelId, setChannelId] = useState('');
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    try {
      const [channelRows, requestRows] = await Promise.all([
        phase9Rows<Channel>(supabase, 'channels', 'id,display_name,handle'),
        phase9Rows<RequestRow>(supabase, 'custom_requests', 'id,channel_id,brief,budget,status,counter_budget,response_note,created_at')
      ]);
      setChannels(channelRows); setRows(requestRows);
      if (!channelId && channelRows[0]) setChannelId(channelRows[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar pedidos.'); }
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (!channelId) throw new Error('Selecciona uma criadora.');
      const amount = Math.round(Number(budget) * 100);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Indica um orçamento válido.');
      await phase9Rpc('create_custom_request', { _channel: channelId, _brief: brief.trim(), _budget: amount, _idem: crypto.randomUUID() });
      setBrief(''); setBudget(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar o pedido.'); }
    finally { setBusy(false); }
  };

  return <PageFrame icon={Package} eyebrow="Pedidos personalizados" title="Transforma uma ideia num pedido." intro="Define o briefing e o orçamento. O escrow é criado pelo servidor e só é libertado quando o fluxo chega ao estado correcto.">
    <ErrorBox message={error} />
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Ficha variant="focus"><form onSubmit={create} className="space-y-4">
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="min-h-11 w-full rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="">Escolher criadora</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.display_name}</option>)}</select>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} required minLength={10} maxLength={4000} placeholder="Descreve o pedido com detalhe." className="min-h-36 w-full rounded-[2px] bg-ink-800 p-3 text-bone-50" />
        <input value={budget} onChange={(e) => setBudget(e.target.value)} required inputMode="decimal" placeholder="Orçamento em MT" className="min-h-11 w-full rounded-[2px] bg-ink-800 px-3 text-bone-50" />
        <Botao type="submit" loading={busy}>Enviar pedido</Botao>
      </form></Ficha>
      <div className="grid gap-4">{rows.map((row) => <Ficha key={row.id}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-bone-50">{row.brief}</p><p className="mt-2 text-sm text-bone-400">{row.status}</p></div><p className="font-display text-2xl text-bone-50">{formatMznFromCents(row.budget)}</p></div>
        {row.counter_budget ? <p className="mt-3 text-sm text-bone-300">Contraproposta: {formatMznFromCents(row.counter_budget)}</p> : null}
        {row.response_note ? <p className="mt-2 text-sm text-bone-400">{row.response_note}</p> : null}
      </Ficha>)}</div>
    </div>
    {!rows.length ? <EstadoVazio title="Ainda não tens pedidos" body="Cria um pedido quando quiseres propor um trabalho personalizado." /> : null}
  </PageFrame>;
}

export function Phase9CreatorRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!supabase) return;
    try {
      const [requestRows, offerRows] = await Promise.all([
        phase9Rows<RequestRow>(supabase, 'custom_requests', 'id,channel_id,brief,budget,status,counter_budget,response_note,created_at'),
        phase9Rows<OfferRow>(supabase, 'custom_request_offers', 'id,request_id,amount,note,status')
      ]);
      setRows(requestRows); setOffers(offerRows);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar pedidos.'); }
  };
  useEffect(() => { void load(); }, []);
  const act = async (requestId: string, status: string, counterBudget?: string) => {
    setBusy(true); setError(null);
    try {
      await phase9Rpc('respond_custom_request', { _request: requestId, _status: status, _counter_budget: counterBudget ? Math.round(Number(counterBudget) * 100) : null, _note: null });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível actualizar o pedido.'); }
    finally { setBusy(false); }
  };
  return <PageFrame icon={Package} eyebrow="Estúdio · Pedidos" title="Pedidos personalizados" intro="Aceita, recusa, contrapropõe e entrega a partir de transacções protegidas por escrow.">
    <ErrorBox message={error} />
    <div className="grid gap-4">{rows.map((row) => {
      const pendingOffer = offers.find((offer) => offer.request_id === row.id && offer.status === 'offered');
      return <Ficha key={row.id}>
        <div className="flex flex-col justify-between gap-4 md:flex-row"><div><p className="text-bone-50">{row.brief}</p><p className="mt-2 text-sm text-bone-400">Estado: {row.status}</p></div><p className="font-display text-2xl text-bone-50">{formatMznFromCents(row.budget)}</p></div>
        {pendingOffer ? <p className="mt-3 text-sm text-bone-300">Contraproposta actual: {formatMznFromCents(pendingOffer.amount)}</p> : null}
        {row.status === 'pending' ? <div className="mt-4 flex flex-wrap gap-2"><Botao disabled={busy} type="button" onClick={() => void act(row.id, 'accepted')}>Aceitar</Botao><Botao disabled={busy} type="button" variant="outline" onClick={() => void act(row.id, 'declined')}>Recusar</Botao><Botao disabled={busy} type="button" variant="outline" onClick={() => { const value = window.prompt('Nova proposta em MT'); if (value) void act(row.id, 'countered', value); }}>Contrapropor</Botao></div> : null}
        {row.status === 'accepted' ? <Botao disabled={busy} className="mt-4" type="button" onClick={() => void act(row.id, 'in_progress')}>Iniciar</Botao> : null}
        {row.status === 'in_progress' ? <Botao disabled={busy} className="mt-4" type="button" onClick={() => void act(row.id, 'delivered')}>Marcar como entregue</Botao> : null}
        <p className="mt-3 text-xs text-bone-500">O escrow só é libertado segundo o estado e o período de retenção definidos no servidor.</p>
      </Ficha>;
    })}</div>
    {!rows.length ? <EstadoVazio title="Sem pedidos" body="Os pedidos que receberes aparecerão aqui." /> : null}
  </PageFrame>;
}

export function Phase9ClientAuctionsPage() {
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [bids, setBids] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { if (!supabase) return; void phase9Rows<AuctionRow>(supabase, 'auctions', 'id,channel_id,title,description,minimum_bid,bid_increment,ends_at,status').then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar leilões.')); }, []);
  const bid = async (auction: AuctionRow) => {
    setBusyId(auction.id); setError(null);
    try {
      const value = Math.round(Number(bids[auction.id] ?? '') * 100);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Indica uma licitação válida.');
      await phase9Rpc('place_bid', { _auction: auction.id, _amount: value, _idem: crypto.randomUUID() });
      setBids((current) => ({ ...current, [auction.id]: '' }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível licitar.'); }
    finally { setBusyId(null); }
  };
  const active = rows.filter((row) => ['scheduled', 'live'].includes(row.status) && new Date(row.ends_at).getTime() > Date.now());
  return <PageFrame icon={Gavel} eyebrow="Leilões" title="Licita com tempo real do servidor." intro="Cada licitação é validada no servidor, usa escrow e respeita o incremento mínimo e o anti-sniping.">
    <ErrorBox message={error}/><div className="grid gap-4">{active.map((auction) => <Ficha key={auction.id} variant="focus"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-bone-50 text-lg">{auction.title}</p><p className="mt-2 text-sm text-bone-400">{auction.description ?? 'Leilão activo.'}</p></div><div className="md:text-right"><p className="font-display text-3xl text-bone-50">{formatMznFromCents(auction.minimum_bid)}</p><p className="text-xs text-bone-500">Incremento: {formatMznFromCents(auction.bid_increment)}</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={bids[auction.id] ?? ''} onChange={(e) => setBids((current) => ({ ...current, [auction.id]: e.target.value }))} inputMode="decimal" placeholder="A tua licitação em MT" className="min-h-11 flex-1 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="button" loading={busyId === auction.id} onClick={() => void bid(auction)}>Licitar</Botao></div><p className="mt-3 text-xs text-bone-500">Termina em {new Date(auction.ends_at).toLocaleString('pt-MZ')}</p></Ficha>)}</div>{!active.length?<EstadoVazio title="Não há leilões activos" body="Quando uma criadora abrir um leilão, ele aparecerá aqui."/>:null}</PageFrame>;
}

export function Phase9CreatorAuctionsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [minimum, setMinimum] = useState('');
  const [increment, setIncrement] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!supabase) return; void phase9Rows<Channel>(supabase, 'channels', 'id,display_name,handle').then((rows) => { setChannels(rows); if (rows[0]) setChannelId(rows[0].id); }).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar canais.')); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await phase9Rpc('create_auction_v2', { _channel: channelId, _title: title.trim(), _description: null, _minimum: Math.round(Number(minimum) * 100), _increment: Math.round(Number(increment || minimum) * 100), _starts: new Date().toISOString(), _ends: new Date(endsAt).toISOString(), _post: null });
      setTitle(''); setMinimum(''); setIncrement(''); setEndsAt('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar o leilão.'); }
    finally { setBusy(false); }
  };
  return <PageFrame icon={Auction} eyebrow="Estúdio · Leilões" title="Criar leilão" intro="Define o incremento e um prazo. Os últimos minutos têm extensão automática anti-sniping.">
    <ErrorBox message={error}/><Ficha><form onSubmit={create} className="grid gap-4 md:grid-cols-2"><select value={channelId} onChange={(e)=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map((channel)=><option key={channel.id} value={channel.id}>{channel.display_name}</option>)}</select><input value={title} onChange={(e)=>setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Título do leilão" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={minimum} onChange={(e)=>setMinimum(e.target.value)} required inputMode="decimal" placeholder="Lance mínimo em MT" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={increment} onChange={(e)=>setIncrement(e.target.value)} required inputMode="decimal" placeholder="Incremento em MT" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input type="datetime-local" value={endsAt} onChange={(e)=>setEndsAt(e.target.value)} required className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit" loading={busy}>Publicar leilão</Botao></form></Ficha>
  </PageFrame>;
}

export function Phase9ClientStorePage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState({ fullName:'', addressLine1:'', city:'', province:'', postalCode:'', phone:'', country:'MZ' });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  useEffect(() => { if (!supabase) return; void phase9Rows<ProductRow>(supabase, 'products', 'id,channel_id,name,description,price,stock,active').then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar loja.')); }, []);
  const buy = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      await phase9Edge<{ ok: boolean; orderId: string }>('create-order', { items: [{ product_id: selected.id, quantity: 1 }], shipping, idempotencyKey: crypto.randomUUID() });
      setSelected(null); setShipping({ fullName:'', addressLine1:'', city:'', province:'', postalCode:'', phone:'', country:'MZ' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar a encomenda.'); }
    finally { setBusy(false); }
  };
  return <PageFrame icon={ShoppingBag} eyebrow="Loja" title="Compra com dados protegidos." intro="A morada é cifrada no backend e só pode ser revelada ao responsável pelo canal da encomenda.">
    <ErrorBox message={error}/><div className="grid gap-4 md:grid-cols-2">{rows.filter((row)=>row.active&&row.stock>0).map((product)=><Ficha key={product.id}><p className="text-bone-50">{product.name}</p><p className="mt-2 text-sm text-bone-400">{product.description??'Produto disponível.'}</p><p className="mt-5 font-display text-3xl text-bone-50">{formatMznFromCents(product.price)}</p><Botao className="mt-4" type="button" onClick={()=>setSelected(product)}>Comprar</Botao></Ficha>)}</div>
    {!rows.length?<EstadoVazio title="Loja sem produtos" body="Quando uma criadora publicar produtos, eles aparecerão aqui."/>:null}
    {selected?<Ficha variant="focus" className="mt-6"><h2 className="font-display text-3xl text-bone-50">{selected.name}</h2><p className="mt-2 text-sm text-bone-400">Preenche os dados de entrega. Serão cifrados antes de chegar à base de dados.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{(Object.entries(shipping) as [keyof typeof shipping,string][]).map(([key,value])=>key==='country'?null:<input key={key} value={value} onChange={(e)=>setShipping((current)=>({...current,[key]:e.target.value}))} required placeholder={key} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/>)}</div><div className="mt-4 flex gap-2"><Botao type="button" variant="outline" onClick={()=>setSelected(null)}>Cancelar</Botao><Botao type="button" loading={busy} onClick={()=>void buy()}>Criar encomenda</Botao></div></Ficha>:null}
  </PageFrame>;
}

export function Phase9CreatorStorePage() {
  const [channels,setChannels]=useState<Channel[]>([]); const [channelId,setChannelId]=useState(''); const [products,setProducts]=useState<ProductRow[]>([]);
  const [name,setName]=useState('');const [description,setDescription]=useState('');const [price,setPrice]=useState('');const [stock,setStock]=useState('');
  const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
  const load=async()=>{if(!supabase)return;try{const [c,p]=await Promise.all([phase9Rows<Channel>(supabase,'channels','id,display_name,handle'),phase9Rows<ProductRow>(supabase,'products','id,channel_id,name,description,price,stock,active')]);setChannels(c);setProducts(p);if(!channelId&&c[0])setChannelId(c[0].id);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar loja.');}};
  useEffect(()=>{void load();},[]);
  const create=async(event:FormEvent)=>{event.preventDefault();setBusy(true);try{await phase9Rpc('create_product',{_channel:channelId,_name:name.trim(),_description:description.trim(),_price:Math.round(Number(price)*100),_stock:Number(stock)});setName('');setDescription('');setPrice('');setStock('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o produto.');}finally{setBusy(false);}};
  return <PageFrame icon={ShoppingBag} eyebrow="Estúdio · Loja" title="Produtos" intro="A criação, preço e stock são validados pelo backend. A encomenda e o escrow seguem o ledger.">
    <ErrorBox message={error}/><Ficha><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><select value={channelId} onChange={(e)=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map((c)=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><input value={name} onChange={(e)=>setName(e.target.value)} required placeholder="Nome do produto" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Descrição" className="min-h-24 rounded-[2px] bg-ink-800 p-3 text-bone-50"/><input value={price} onChange={(e)=>setPrice(e.target.value)} required inputMode="decimal" placeholder="Preço em MT" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={stock} onChange={(e)=>setStock(e.target.value)} required inputMode="numeric" placeholder="Stock" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit" loading={busy}>Criar produto</Botao></form></Ficha><div className="mt-6 grid gap-3">{products.map((product)=><Ficha key={product.id}><div className="flex justify-between gap-4"><div><p className="text-bone-50">{product.name}</p><p className="text-sm text-bone-400">Stock: {product.stock}</p></div><p className="font-display text-2xl text-bone-50">{formatMznFromCents(product.price)}</p></div></Ficha>)}</div>
  </PageFrame>;
}

export function Phase9ClientBundlesPage() {
  const [rows,setRows]=useState<BundleRow[]>([]);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{if(!supabase)return;void phase9Rows<BundleRow>(supabase,'bundles','id,channel_id,name,description,price,expires_at,status').then(setRows).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar bundles.'));},[]);
  const buy=async(id:string)=>{setBusy(id);setError(null);try{await phase9Rpc('buy_bundle_v2',{_bundle:id,_promotion_code:null,_idem:crypto.randomUUID()});}catch(e){setError(e instanceof Error?e.message:'Não foi possível comprar o bundle.');}finally{setBusy(null);}};
  return <PageFrame icon={Package} eyebrow="Bundles" title="Conteúdo em conjunto." intro="Cada compra é idempotente, passa pelo ledger e pode usar promoções válidas do canal.">
    <ErrorBox message={error}/><div className="grid gap-4 md:grid-cols-2">{rows.filter(r=>r.status==='active').map(r=><Ficha key={r.id}><p className="text-bone-50">{r.name}</p><p className="mt-2 text-sm text-bone-400">{r.description??'Bundle disponível.'}</p><p className="mt-4 font-display text-3xl text-bone-50">{formatMznFromCents(r.price)}</p><Botao className="mt-4" type="button" loading={busy===r.id} onClick={()=>void buy(r.id)}>Comprar bundle</Botao></Ficha>)}</div>
  </PageFrame>;
}

export function Phase9ClientGiveawaysPage() {
  const [rows,setRows]=useState<GiveawayRow[]>([]);const [error,setError]=useState<string|null>(null);
  const load=async()=>{if(!supabase)return;try{setRows(await phase9Rows<GiveawayRow>(supabase,'giveaways','id,channel_id,title,description,winner_count,starts_at,ends_at,requires_subscription,status'));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar sorteios.');}};useEffect(()=>{void load();},[]);
  const enter=async(id:string)=>{try{await phase9Rpc('enter_giveaway',{_giveaway:id});await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível participar.');}};
  const active=rows.filter(r=>r.status==='scheduled'||r.status==='live');
  return <PageFrame icon={Gift} eyebrow="Sorteios" title="Participação controlada pelo servidor." intro="As entradas, elegibilidade e vencedores não são calculados no navegador.">
    <ErrorBox message={error}/><div className="grid gap-4">{active.map(r=><Ficha key={r.id}><div className="flex items-start justify-between gap-3"><div><p className="text-bone-50">{r.title}</p><p className="mt-2 text-sm text-bone-400">{r.description??'Sorteio activo.'}</p></div><p className="font-display text-xl text-bone-50">{r.winner_count} vencedor(es)</p></div><Botao className="mt-4" type="button" onClick={()=>void enter(r.id)}>Participar</Botao></Ficha>)}</div>{!active.length?<EstadoVazio title="Sem sorteios activos" body="Não existem sorteios disponíveis neste momento."/>:null}
  </PageFrame>;
}

export function Phase9ClientLoyaltyPage() {
  const [points,setPoints]=useState(0);const [lifetime,setLifetime]=useState(0);const [streak,setStreak]=useState({current_days:0,longest_days:0});const [missions,setMissions]=useState<MissionRow[]>([]);const [progress,setProgress]=useState<Record<string,number>>({});const [badges,setBadges]=useState<BadgeRow[]>([]);const [ownedBadgeIds,setOwnedBadgeIds]=useState<string[]>([]);const [error,setError]=useState<string|null>(null);
  const load=async()=>{if(!supabase)return;try{const [lp,st,ms,mp,bs,ubs]=await Promise.all([phase9Rows<{points:number;lifetime_points:number}>(supabase,'loyalty_points','points,lifetime_points'),phase9Rows<{current_days:number;longest_days:number}>(supabase,'streaks','current_days,longest_days'),phase9Rows<MissionRow>(supabase,'missions','id,code,name_key,description_key,target,points_reward,active'),phase9Rows<{mission_id:string;progress:number}>(supabase,'mission_progress','mission_id,progress'),phase9Rows<BadgeRow>(supabase,'badges','id,code,name_key,description_key,points_threshold,price,active'),phase9Rows<{badge_id:string}>(supabase,'user_badges','badge_id')]);setPoints(lp[0]?.points??0);setLifetime(lp[0]?.lifetime_points??0);setStreak(st[0]??{current_days:0,longest_days:0});setMissions(ms.filter(m=>m.active));setProgress(Object.fromEntries(mp.map(m=>[m.mission_id,m.progress])));setBadges(bs.filter(b=>b.active));setOwnedBadgeIds(ubs.map(b=>b.badge_id));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar fidelidade.');}};
  useEffect(()=>{void phase9Rpc<{current_days:number;longest_days:number;points:number}>('record_login').then(r=>{setStreak({current_days:r.current_days,longest_days:r.longest_days});setPoints(r.points);}).catch(()=>undefined);void load();},[]);
  const mission=async(id:string)=>{try{await phase9Rpc('complete_mission',{_mission:id,_increment:1});await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível actualizar a missão.');}};
  const purchaseBadge=async(id:string)=>{try{await phase9Rpc('purchase_badge',{_badge:id,_idem:crypto.randomUUID()});await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível adquirir o selo.');}};
  return <PageFrame icon={Trophy} eyebrow="Fidelidade" title="Progresso que não exige gasto." intro="Pontos, missões e streaks existem para aprofundar a relação com a plataforma. As missões não exigem compras.">
    <ErrorBox message={error}/><div className="grid gap-4 md:grid-cols-3"><Ficha><p className="text-sm text-bone-400">Pontos</p><p className="mt-2 font-display text-4xl text-bone-50">{points}</p></Ficha><Ficha><p className="text-sm text-bone-400">Pontos acumulados</p><p className="mt-2 font-display text-4xl text-bone-50">{lifetime}</p></Ficha><Ficha><p className="text-sm text-bone-400">Sequência actual</p><p className="mt-2 font-display text-4xl text-bone-50">{streak.current_days} dias</p></Ficha></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><Ficha><div className="flex items-center gap-2"><Target size={22}/><h2 className="text-lg text-bone-50">Missões</h2></div><div className="mt-4 grid gap-3">{missions.map(m=><div key={m.id} className="rounded-[2px] border border-bone-50/8 p-3"><div className="flex justify-between gap-3"><span className="text-bone-50">{m.name_key}</span><span className="text-sm text-bone-400">{progress[m.id]??0}/{m.target}</span></div><Botao className="mt-3" type="button" disabled={(progress[m.id]??0)>=m.target} onClick={()=>void mission(m.id)}>Actualizar progresso</Botao></div>)}</div></Ficha><Ficha><div className="flex items-center gap-2"><Crown size={22}/><h2 className="text-lg text-bone-50">Selos</h2></div><div className="mt-4 grid gap-3">{badges.map(b=><div key={b.id} className="flex items-center justify-between gap-4 rounded-[2px] border border-bone-50/8 p-3"><div><p className="text-bone-50">{b.name_key}</p><p className="text-sm text-bone-400">{b.points_threshold ? String(b.points_threshold)+' pontos' : 'Selo disponível'}</p></div>{ownedBadgeIds.includes(b.id)?<span className="text-sm text-bone-400">Já tens</span>:b.price?<Botao type="button" onClick={()=>void purchaseBadge(b.id)}>Adquirir {formatMznFromCents(b.price)}</Botao>:null}</div>)}</div></Ficha></div>
  </PageFrame>;
}

export function Phase9ClientPremiumPage() {
  const [features,setFeatures]=useState<PremiumRow[]>([]);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!supabase)return;void phase9Rows<PremiumRow>(supabase,'premium_features','id,code,name_key,description_key,price,duration_days,active').then(setFeatures).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar premium.'));},[]);
  const buy=async(feature:PremiumRow)=>{try{await phase9Rpc('purchase_premium_feature',{_feature:feature.id,_channel:null,_idem:crypto.randomUUID()});}catch(e){setError(e instanceof Error?e.message:'Não foi possível activar esta funcionalidade.');}};
  const active=features.filter(f=>f.active&&f.code!=='featured_creator');
  return <PageFrame icon={Crown} eyebrow="Premium" title="Camada premium do cliente" intro="Funcionalidades com duração definida e débito server-side.">
    <ErrorBox message={error}/><div className="grid gap-4 md:grid-cols-2">{active.map(f=><Ficha key={f.id}><p className="text-bone-50">{f.name_key}</p><p className="mt-2 text-sm text-bone-400">{f.description_key}</p><p className="mt-4 font-display text-3xl text-bone-50">{formatMznFromCents(f.price)}</p><p className="text-xs text-bone-500">{f.duration_days} dias</p><Botao className="mt-4" type="button" onClick={()=>void buy(f)}>Activar</Botao></Ficha>)}</div>{!active.length?<EstadoVazio title="Premium indisponível neste momento" body="Nenhuma funcionalidade premium de cliente está activa na configuração actual."/>:null}
  </PageFrame>;
}

export function Phase9ClientDiscoveryPage() {
  const [rows,setRows]=useState<{channel_id:string;handle:string;display_name:string;reason:string}[]>([]);const [featured,setFeatured]=useState<{channel_id:string;handle:string;display_name:string;placement:string}[]>([]);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{void Promise.all([phase9Rpc<{channel_id:string;handle:string;display_name:string;reason:string}[]>('recommend_channels',{_limit:20}),phase9Rpc<{channel_id:string;handle:string;display_name:string;placement:string}[]>('get_featured_channels',{_limit:10})]).then(([a,b])=>{setRows(a);setFeatured(b);}).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar descoberta.'));},[]);
  const record=async(channelId:string,eventType:string)=>{try{await phase9Rpc('record_recommendation_event',{_channel:channelId,_event_type:eventType});}catch{}};
  return <PageFrame icon={Compass} eyebrow="Descobrir" title="Recomendações com regras reais." intro="A camada de descoberta combina contexto, actividade, preferências e destaque configurado. Não cria métricas fictícias.">
    <ErrorBox message={error}/><div className="grid gap-4 md:grid-cols-2">{featured.map(r=><Ficha key={r.channel_id} variant="focus"><p className="text-xs text-bone-500">Destaque</p><p className="mt-2 text-xl text-bone-50">{r.display_name}</p><p className="mt-1 text-sm text-bone-400">@{r.handle}</p><div className="mt-4 flex gap-2"><Botao type="button" variant="outline" onClick={()=>void record(r.channel_id,'open')}>Abrir</Botao><Botao type="button" variant="ghost" onClick={()=>void record(r.channel_id,'not_interested')}>Não mostrar</Botao></div></Ficha>)}{rows.map(r=><Ficha key={r.channel_id}><p className="text-xl text-bone-50">{r.display_name}</p><p className="mt-1 text-sm text-bone-400">@{r.handle}</p><p className="mt-3 text-sm text-bone-300">{r.reason}</p><div className="mt-4 flex gap-2"><Botao type="button" variant="outline" onClick={()=>void record(r.channel_id,'open')}>Abrir</Botao><Botao type="button" variant="ghost" onClick={()=>void record(r.channel_id,'not_interested')}>Não mostrar</Botao></div></Ficha>)}</div>{!rows.length&&!featured.length?<EstadoVazio title="Ainda não há recomendações" body="A descoberta começa a aprender à medida que a plataforma recebe actividade real."/>:null}
  </PageFrame>;
}

export function Phase9CreatorAnalyticsPage() {
  const [channels,setChannels]=useState<Channel[]>([]);const [channelId,setChannelId]=useState('');const [rows,setRows]=useState<AnalyticsRow[]>([]);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!supabase)return;void phase9Rows<Channel>(supabase,'channels','id,display_name,handle').then(c=>{setChannels(c);if(c[0])setChannelId(c[0].id);}).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar canais.'));},[]);
  useEffect(()=>{if(!channelId)return;void phase9Rpc<AnalyticsRow[]>('get_creator_analytics',{_channel:channelId,_days:30}).then(setRows).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar analytics.'));},[channelId]);
  return <PageFrame icon={ChartLine} eyebrow="Estúdio · Analytics" title="Analytics da criadora" intro="Os indicadores são derivados de actividade real e não dependem de métricas fabricadas.">
    <ErrorBox message={error}/><select value={channelId} onChange={(e)=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><div className="mt-5 grid gap-3 md:grid-cols-3">{rows.slice(0,12).map(r=><Ficha key={r.day}><p className="text-sm text-bone-400">{r.day}</p><p className="mt-2 text-bone-50">{r.views} visualizações</p><p className="mt-1 text-sm text-bone-400">{r.followers} seguidores · {r.active_subscribers} assinantes activos</p><p className="mt-2 font-display text-xl text-bone-50">{formatMznFromCents(r.gross_amount)}</p></Ficha>)}</div>{!rows.length?<EstadoVazio title="Ainda não há dados" body="Os analytics aparecem depois de existir actividade real no canal."/>:null}
  </PageFrame>;
}

export function Phase9CreatorFansPage() {
  const [channels,setChannels]=useState<Channel[]>([]);const [channelId,setChannelId]=useState('');const [fans,setFans]=useState<FanRow[]>([]);const [fanId,setFanId]=useState('');const [tag,setTag]=useState('');const [note,setNote]=useState('');const [error,setError]=useState<string|null>(null);
  const load=async(id=channelId)=>{if(!id)return;try{setFans(await phase9Rpc<FanRow[]>('get_fan_crm',{_channel:id,_limit:100}));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar CRM.');}};
  useEffect(()=>{if(!supabase)return;void phase9Rows<Channel>(supabase,'channels','id,display_name,handle').then(c=>{setChannels(c);if(c[0]){setChannelId(c[0].id);void load(c[0].id);}}).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar canais.'));},[]);
  const saveNote=async(event:FormEvent)=>{event.preventDefault();if(!fanId)return;try{await phase9Rpc('add_fan_note',{_channel:channelId,_fan:fanId,_tag:tag.trim(),_note:note.trim()});setTag('');setNote('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível guardar a nota.');}};
  return <PageFrame icon={UserList} eyebrow="Estúdio · Fãs" title="Fan CRM" intro="Visão de relacionamento baseada em pseudónimo, subscrições, compras e actividade de comunicação.">
    <ErrorBox message={error}/><select value={channelId} onChange={e=>{setChannelId(e.target.value);void load(e.target.value);}} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><Ficha className="mt-5"><form onSubmit={saveNote} className="grid gap-3 md:grid-cols-3"><select value={fanId} onChange={e=>setFanId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="">Seleccionar fã</option>{fans.map(f=><option key={f.fan_id} value={f.fan_id}>{f.pseudonym}</option>)}</select><input value={tag} onChange={e=>setTag(e.target.value)} placeholder="Etiqueta" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={note} onChange={e=>setNote(e.target.value)} required placeholder="Nota" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit">Guardar nota</Botao></form></Ficha><div className="mt-5 grid gap-3">{fans.map(f=><Ficha key={f.fan_id}><div className="flex items-center justify-between gap-4"><div><p className="text-bone-50">{f.pseudonym}</p><p className="text-sm text-bone-400">{f.subscriptions} subscrição(ões) activas · {f.purchases} compras</p></div><p className="text-sm text-bone-400">{f.last_message_at?new Date(f.last_message_at).toLocaleDateString('pt-MZ'):'sem mensagem'}</p></div></Ficha>)}</div>{!fans.length?<EstadoVazio title="Ainda sem fãs visíveis" body="O CRM apresenta apenas actividade real associada ao canal."/>:null}
  </PageFrame>;
}

export function Phase9CreatorGoalsPage() {
  const [channels,setChannels]=useState<Channel[]>([]);const [channelId,setChannelId]=useState('');const [name,setName]=useState('');const [target,setTarget]=useState('');const [starts,setStarts]=useState('');const [ends,setEnds]=useState('');const [goals,setGoals]=useState<{id:string;channel_id:string;name:string;target_amount:number;starts_at:string;ends_at:string;status:string}[]>([]);const [error,setError]=useState<string|null>(null);
  const load=async()=>{if(!supabase)return;try{const [c,g]=await Promise.all([phase9Rows<Channel>(supabase,'channels','id,display_name,handle'),phase9Rows<{id:string;channel_id:string;name:string;target_amount:number;starts_at:string;ends_at:string;status:string}>(supabase,'creator_goals','id,channel_id,name,target_amount,starts_at,ends_at,status')]);setChannels(c);setGoals(g);if(!channelId&&c[0])setChannelId(c[0].id);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar metas.');}};useEffect(()=>{void load();},[]);
  const create=async(event:FormEvent)=>{event.preventDefault();try{await phase9Rpc('create_creator_goal',{_channel:channelId,_name:name.trim(),_target:Math.round(Number(target)*100),_starts_at:new Date(starts).toISOString(),_ends_at:new Date(ends).toISOString()});setName('');setTarget('');setStarts('');setEnds('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a meta.');}};
  return <PageFrame icon={Target} eyebrow="Estúdio · Metas" title="Metas da criadora" intro="Metas ligadas à actividade económica real do canal, com progresso calculado no servidor.">
    <ErrorBox message={error}/><Ficha><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Nome da meta" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={target} onChange={e=>setTarget(e.target.value)} required inputMode="decimal" placeholder="Objectivo em MT" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} required className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} required className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit">Criar meta</Botao></form></Ficha><div className="mt-5 grid gap-3">{goals.filter(g=>g.channel_id===channelId).map(g=><Ficha key={g.id}><p className="text-bone-50">{g.name}</p><p className="mt-2 text-sm text-bone-400">Objectivo: {formatMznFromCents(g.target_amount)}</p><GoalProgress goalId={g.id}/></Ficha>)}</div>
  </PageFrame>;
}
function GoalProgress({ goalId }: { goalId: string }) {
  const [data,setData]=useState<{current_amount:number;target_amount:number;status:string}|null>(null);
  useEffect(()=>{void phase9Rpc<{current_amount:number;target_amount:number;status:string}>('update_goal_progress',{_goal:goalId}).then(setData).catch(()=>undefined);},[goalId]);
  if(!data)return <LoadingLine />;
  const pct=Math.min(100,Math.round((data.current_amount/Math.max(1,data.target_amount))*100));
  return <div className="mt-3"><div className="h-1 overflow-hidden bg-ink-800"><div className="h-full bg-crimson-500" style={{ width: pct + '%' }}/></div><p className="mt-2 text-sm text-bone-400">{formatMznFromCents(data.current_amount)} · {pct}%</p></div>;
}

export function Phase9CreatorPromotionsPage() {
  const [channels,setChannels]=useState<Channel[]>([]);const [channelId,setChannelId]=useState('');const [rows,setRows]=useState<{id:string;code:string;name:string;kind:string;value:number;active:boolean}[]>([]);const [code,setCode]=useState('');const [name,setName]=useState('');const [kind,setKind]=useState<'percent'|'fixed'>('percent');const [value,setValue]=useState('');const [error,setError]=useState<string|null>(null);
  const load=async()=>{if(!supabase)return;try{const [c,p]=await Promise.all([phase9Rows<Channel>(supabase,'channels','id,display_name,handle'),phase9Rows<{id:string;code:string;name:string;kind:string;value:number;active:boolean}>(supabase,'promotions','id,code,name,kind,value,active')]);setChannels(c);setRows(p);if(!channelId&&c[0])setChannelId(c[0].id);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar promoções.');}};useEffect(()=>{void load();},[]);
  const create=async(event:FormEvent)=>{event.preventDefault();try{const numeric=kind==='percent'?Math.round(Number(value)*100):Math.round(Number(value)*100);await phase9Rpc('create_promotion',{_channel:channelId,_code:code.trim(),_name:name.trim(),_kind:kind,_value:numeric,_applies_to:'all',_min_subtotal:null,_max_discount:null,_max_redemptions:null,_per_user_limit:1,_starts_at:new Date().toISOString(),_ends_at:null});setCode('');setName('');setValue('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a promoção.');}};
  const toggle=async(row:{id:string;active:boolean})=>{try{await phase9Rpc('set_promotion_active',{_promotion:row.id,_active:!row.active});await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível actualizar a promoção.');}};
  return <PageFrame icon={Tag} eyebrow="Estúdio · Promoções" title="Promoções" intro="Códigos e descontos são validados e registados no servidor.">
    <ErrorBox message={error}/><Ficha><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><input value={code} onChange={e=>setCode(e.target.value)} required placeholder="Código" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Nome interno" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><select value={kind} onChange={e=>setKind(e.target.value as 'percent'|'fixed')} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="percent">Percentagem</option><option value="fixed">Valor fixo</option></select><input value={value} onChange={e=>setValue(e.target.value)} required inputMode="decimal" placeholder={kind==='percent'?'Percentagem':'Valor em MT'} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit">Criar promoção</Botao></form></Ficha><div className="mt-5 grid gap-3">{rows.map(r=><Ficha key={r.id}><div className="flex items-center justify-between gap-4"><div><p className="text-bone-50">{r.code} · {r.name}</p><p className="mt-1 text-sm text-bone-400">{r.kind==='percent'?r.value/100:formatMznFromCents(r.value)}</p></div><Botao variant={r.active?'outline':'primary'} type="button" onClick={()=>void toggle(r)}>{r.active?'Desactivar':'Activar'}</Botao></div></Ficha>)}</div>
  </PageFrame>;
}

export function Phase9ClientGiftsPage() {
  const [gifts,setGifts]=useState<{id:string;name:string;price:number;active:boolean}[]>([]);const [channelId,setChannelId]=useState('');const [channels,setChannels]=useState<Channel[]>([]);const [message,setMessage]=useState('');const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!supabase)return;void Promise.all([phase9Rows<{id:string;name:string;price:number;active:boolean}>(supabase,'gifts_catalog','id,name,price,active'),phase9Rows<Channel>(supabase,'channels','id,display_name,handle')]).then(([g,c])=>{setGifts(g.filter(x=>x.active));setChannels(c);if(c[0])setChannelId(c[0].id);}).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar presentes.'));},[]);
  const send=async(id:string)=>{try{await phase9Rpc('send_gift',{_channel:channelId,_gift:id,_quantity:1,_message:message,_idem:crypto.randomUUID()});setMessage('');}catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar o presente.');}};
  return <PageFrame icon={Gift} eyebrow="Presentes" title="Presentes digitais" intro="Os presentes usam o mesmo ledger da plataforma e nunca alteram saldo pelo browser.">
    <ErrorBox message={error}/><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50">{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><input value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} placeholder="Mensagem opcional" className="mt-3 min-h-11 w-full rounded-[2px] bg-ink-800 px-3 text-bone-50"/><div className="mt-5 grid gap-4 md:grid-cols-2">{gifts.map(g=><Ficha key={g.id}><p className="text-bone-50">{g.name}</p><p className="mt-2 font-display text-2xl text-bone-50">{formatMznFromCents(g.price)}</p><Botao className="mt-4" type="button" onClick={()=>void send(g.id)}>Enviar presente</Botao></Ficha>)}</div>
  </PageFrame>;
}

export function Phase9BusinessIntegrationsPage() {
  const states=[{key:'translation',enabled:featureFlags.translation,label:'Tradução de mensagens'},{key:'ai_response_assistant',enabled:featureFlags.aiResponseAssistant,label:'Assistente de respostas IA'},{key:'auto_captions',enabled:featureFlags.autoCaptions,label:'Legendas automáticas'},{key:'face_blur',enabled:featureFlags.faceBlur,label:'Face blur'},{key:'advanced_media_processing',enabled:featureFlags.advancedMediaProcessing,label:'Processamento avançado de media'},{key:'referral',enabled:featureFlags.referral,label:'Referral'},{key:'agency',enabled:featureFlags.agency,label:'Agência'}];
  return <PageFrame icon={Sparkle} eyebrow="Control Room · Integrações" title="Integrações condicionadas" intro="Estas superfícies existem com contratos reais, mas ficam desligadas até existirem providers aprovados e secrets válidas."><div className="grid gap-4 md:grid-cols-2">{states.map(s=><Ficha key={s.key}><div className="flex items-start justify-between gap-4"><div><p className="text-bone-50">{s.label}</p><p className="mt-2 text-sm text-bone-400">Flag: {s.enabled?'activa':'desligada'}</p></div><ShieldCheck size={22}/></div><p className="mt-3 text-xs text-bone-500">{s.enabled?'Provider a validar.':'Desligada sem provider certificado.'}</p></Ficha>)}</div></PageFrame>;
}

export function Phase9AdminBusinessPage() {
  const [features,setFeatures]=useState<PremiumRow[]>([]);const [code,setCode]=useState('');const [nameKey,setNameKey]=useState('');const [descriptionKey,setDescriptionKey]=useState('');const [price,setPrice]=useState('');const [duration,setDuration]=useState('30');const [active,setActive]=useState(false);const [channelId,setChannelId]=useState('');const [placement,setPlacement]=useState('discovery');const [starts,setStarts]=useState('');const [ends,setEnds]=useState('');const [channels,setChannels]=useState<Channel[]>([]);const [error,setError]=useState<string|null>(null);
  const load=async()=>{if(!supabase)return;try{const [f,c]=await Promise.all([phase9Rows<PremiumRow>(supabase,'premium_features','id,code,name_key,description_key,price,duration_days,active'),phase9Rows<Channel>(supabase,'channels','id,display_name,handle')]);setFeatures(f);setChannels(c);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar Control Room.');}};useEffect(()=>{void load();},[]);
  const createFeature=async(event:FormEvent)=>{event.preventDefault();try{await phase9Rpc('create_premium_feature',{_code:code.trim(),_name_key:nameKey.trim(),_description_key:descriptionKey.trim(),_price:Math.round(Number(price)*100),_duration_days:Number(duration),_active:active});setCode('');setNameKey('');setDescriptionKey('');setPrice('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível guardar a funcionalidade premium.');}};
  const feature=async(event:FormEvent)=>{event.preventDefault();try{await phase9Rpc('create_featured_channel_admin',{_channel:channelId,_placement:placement,_starts_at:new Date(starts).toISOString(),_ends_at:new Date(ends).toISOString()});setChannelId('');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível destacar o canal.');}};
  return <PageFrame icon={ShieldCheck} eyebrow="Control Room · Business" title="Business Engine" intro="Configuração administrativa das peças que têm impacto comercial."><ErrorBox message={error}/><div className="grid gap-6 lg:grid-cols-2"><Ficha><h2 className="text-lg text-bone-50">Premium features</h2><form onSubmit={createFeature} className="mt-4 grid gap-3"><input value={code} onChange={e=>setCode(e.target.value)} required placeholder="Código" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={nameKey} onChange={e=>setNameKey(e.target.value)} required placeholder="Chave do nome" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={descriptionKey} onChange={e=>setDescriptionKey(e.target.value)} required placeholder="Chave da descrição" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={price} onChange={e=>setPrice(e.target.value)} required inputMode="decimal" placeholder="Preço em MT" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input value={duration} onChange={e=>setDuration(e.target.value)} required inputMode="numeric" placeholder="Dias" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><label className="flex items-center gap-3 text-sm text-bone-300"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Disponibilizar</label><Botao type="submit">Guardar</Botao></form></Ficha><Ficha><h2 className="text-lg text-bone-50">Featured creators</h2><form onSubmit={feature} className="mt-4 grid gap-3"><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="">Escolher canal</option>{channels.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select><select value={placement} onChange={e=>setPlacement(e.target.value)} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="discovery">Discovery</option><option value="home">Home</option><option value="search">Pesquisa</option></select><input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)} required className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)} required className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"/><Botao type="submit">Destacar canal</Botao></form></Ficha></div><div className="mt-6 grid gap-3">{features.map(f=><Ficha key={f.id}><div className="flex justify-between gap-3"><span className="text-bone-50">{f.code}</span><span className="text-sm text-bone-400">{f.active?'activa':'desligada'} · {formatMznFromCents(f.price)} · {f.duration_days} dias</span></div></Ficha>)}</div></PageFrame>;
}

export function Phase9CreatorReferralPage() {
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<{ id: string; code: string; active: boolean }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const rows = await phase9Rows<{ id: string; code: string; active: boolean }>(requireSupabase(), 'referral_codes', 'id,code,active');
      setCodes(rows);
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Falha ao carregar referral.');
    }
  };
  useEffect(() => { void load(); }, []);
  const create = async () => {
    try {
      if (!code.trim()) throw new Error('Indica um código.');
      await phase9Rpc('create_referral_code', { _code: code.trim() });
      setCode('');
      setNotice('Código criado.');
      await load();
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Não foi possível criar o código.');
    }
  };
  const redeem = async () => {
    try {
      if (!code.trim()) throw new Error('Indica um código.');
      await phase9Rpc('redeem_referral', { _code: code.trim() });
      setCode('');
      setNotice('Referral aplicado.');
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Não foi possível aplicar o referral.');
    }
  };
  return <PageFrame icon={UsersThree} title="Referral" intro="Convites e recompensa são tratados no servidor e ficam associados ao utilizador autenticado.">
    <ErrorBox message={error} />
    {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
    <Ficha className="p-5">
      <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código referral" className="min-h-11 w-full rounded-[2px] bg-ink-800 px-3 text-bone-50" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao onClick={() => void create()}>Criar código</Botao>
        <Botao variant="outline" onClick={() => void redeem()}>Aplicar código</Botao>
      </div>
    </Ficha>
    <div className="mt-4 grid gap-3">{codes.map((item) => <Ficha key={item.id}><p className="text-bone-50">{item.code}</p><p className="mt-1 text-xs text-bone-500">{item.active ? 'Activo' : 'Inactivo'}</p></Ficha>)}</div>
  </PageFrame>;
}

export function Phase9AgencyPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [agencies, setAgencies] = useState<{ id: string; name: string; status: string }[]>([]);
  const [members, setMembers] = useState<{ creator_id: string; status: string; commission_rate_bps: number; consent_at: string | null }[]>([]);
  const [creatorId, setCreatorId] = useState('');
  const [commission, setCommission] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (!user) return;
    try {
      const sb = requireSupabase();
      const agencyRows = await sb.from('agencies').select('id,name,status').eq('owner_id', user.id).order('created_at', { ascending: false });
      if (agencyRows.error) throw agencyRows.error;
      setAgencies(agencyRows.data ?? []);
      const current = agencyId || agencyRows.data?.[0]?.id || '';
      if (current) {
        setAgencyId(current);
        const dashboard = await phase9Rpc<unknown[]>('get_agency_dashboard', { _agency: current });
        setMembers((dashboard ?? []).map((item) => item as { creator_id: string; status: string; commission_rate_bps: number; consent_at: string | null }));
      }
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Falha ao carregar agência.');
    }
  };
  useEffect(() => { void load(); }, [user]);
  const create = async () => {
    try {
      if (!name.trim()) throw new Error('Indica o nome da agência.');
      const id = await phase9Rpc<string>('create_agency', { _name: name.trim() });
      setAgencyId(String(id));
      setName('');
      await load();
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Não foi possível criar a agência.');
    }
  };
  const invite = async () => {
    try {
      if (!agencyId || !creatorId) throw new Error('Indica a agência e a criadora.');
      const result = await phase9Rpc('invite_agency_creator', {
        _agency: agencyId,
        _creator: creatorId,
        _commission_rate_bps: Math.max(0, Math.min(10000, Math.round(Number(commission) * 100))),
        _permissions: { analytics: true, content: true },
      });
      void result;
      await load();
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Não foi possível enviar o convite.');
    }
  };
  return <PageFrame icon={UsersThree} title="Modo agência" intro="A agência só vê o painel agregado autorizado. Dinheiro, levantamentos, palavras-passe, KYC e mensagens privadas permanecem fora do alcance da agência.">
    <ErrorBox message={error} />
    <Ficha className="p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da agência" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50" />
        <select value={agencyId} onChange={(event) => { setAgencyId(event.target.value); void load(); }} className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50"><option value="">Agência</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select>
        <Botao onClick={() => void create()}>Criar agência</Botao>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <input value={creatorId} onChange={(event) => setCreatorId(event.target.value)} placeholder="UUID da criadora" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50" />
        <input value={commission} onChange={(event) => setCommission(event.target.value)} inputMode="decimal" placeholder="Comissão %" className="min-h-11 rounded-[2px] bg-ink-800 px-3 text-bone-50" />
        <Botao variant="outline" onClick={() => void invite()} disabled={!agencyId || !creatorId}>Convidar</Botao>
      </div>
    </Ficha>
    <div className="mt-4 grid gap-3">{members.map((member) => <Ficha key={member.creator_id}><p className="text-bone-50">@{member.creator_id.slice(0, 8)}</p><p className="mt-1 text-xs text-bone-500">{member.status} · {member.commission_rate_bps / 100}% · consentimento {member.consent_at ? 'registado' : 'pendente'}</p></Ficha>)}</div>
  </PageFrame>;
}
