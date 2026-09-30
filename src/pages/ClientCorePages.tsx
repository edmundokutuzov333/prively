import { useEffect, useMemo, useState } from 'react';
import { Compass, FilmStrip, GearSix, LockKey, Money, ShoppingBagOpen } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Botao } from '@/design/Botao';
import { PageFrame } from '@/pages/PageFrame';
import { Cortina } from '@/design/Cortina';
import { SocialPostActions } from '@/features/social/SocialPostActions';
import { requireSupabase } from '@/lib/supabase';
import { hasPin, setPin } from '@/lib/pin';
import { formatMznFromCents } from '@/lib/money';
import { useAuth } from '@/app/session';
import i18n from '@/lib/i18n';

type Channel = {
  id: string;
  owner_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  bairro: string | null;
  province: string | null;
};

type MediaPreview = {
  assetId: string;
  kind: 'image' | 'video' | 'audio';
  locked: boolean;
  url: string | null;
  thumbnailUrl: string | null;
  watermark?: { enabled: boolean; text: string | null };
};

type FeedPost = {
  id: string;
  channel_id: string;
  caption: string | null;
  visibility: string;
  price: number | null;
  publish_at: string | null;
  is_story: boolean;
  media: MediaPreview | null;
};

function useChannels() {
  const [rows, setRows] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const result = await requireSupabase()
        .from('channels')
        .select('id,owner_id,handle,display_name,bio,city,bairro,province')
        .order('created_at', { ascending: false })
        .limit(200);
      if (result.error) throw result.error;
      setRows((result.data ?? []) as Channel[]);
    } catch (errorValue: unknown) {
      setError(errorValue instanceof Error ? errorValue.message : 'Falha ao carregar criadoras.');
    }
  };
  useEffect(() => { void load(); }, []);
  return { rows, error, reload: load };
}

export function ClientDiscoverCorePage() {
  const { rows, error } = useChannels();
  const { user } = useAuth();
  const [following, setFollowing] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [agendaOnly, setAgendaOnly] = useState(false);
  const [agendaChannels, setAgendaChannels] = useState<string[]>([]);
  const [channelKinds, setChannelKinds] = useState<Record<string, string[]>>({});
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const sb = requireSupabase();
      const [followResult, availabilityResult, postsResult, mediaResult] = await Promise.all([
        sb.from('follows').select('channel_id').eq('follower_id', user.id).limit(500),
        sb.from('availability_slots').select('channel_id,starts_at,ends_at').gte('ends_at', new Date().toISOString()).limit(500),
        sb.from('posts').select('id,channel_id').eq('status', 'published').eq('is_story', false).limit(500),
        sb.from('media_assets').select('post_id,kind').is('deleted_at', null).limit(1000),
      ]);
      if (followResult.error) throw followResult.error;
      if (availabilityResult.error) throw availabilityResult.error;
      if (postsResult.error) throw postsResult.error;
      if (mediaResult.error) throw mediaResult.error;

      setFollowing((followResult.data ?? []).map((row) => String(row.channel_id)));
      setAgendaChannels([...new Set((availabilityResult.data ?? []).map((row) => String(row.channel_id)))]);
      const kindsByPost = new Map<string, string[]>();
      for (const asset of mediaResult.data ?? []) {
        const key = String(asset.post_id);
        const list = kindsByPost.get(key) ?? [];
        const kindValue = String(asset.kind);
        if (!list.includes(kindValue)) list.push(kindValue);
        kindsByPost.set(key, list);
      }
      const byChannel: Record<string, string[]> = {};
      for (const post of postsResult.data ?? []) {
        const current = byChannel[String(post.channel_id)] ?? [];
        for (const kindValue of kindsByPost.get(String(post.id)) ?? []) {
          if (!current.includes(kindValue)) current.push(kindValue);
        }
        byChannel[String(post.channel_id)] = current;
      }
      setChannelKinds(byChannel);
    };
    void load().catch(() => undefined);
  }, [user]);

  const toggleFollow = async (channelId: string) => {
    if (!user) return;
    const isFollowing = following.includes(channelId);
    const { error: rpcError } = await requireSupabase().rpc(
      isFollowing ? 'unfollow_channel' : 'follow_channel',
      { _channel: channelId },
    );
    if (rpcError) return;
    setFollowing((current) => isFollowing
      ? current.filter((id) => id !== channelId)
      : [...current, channelId]);
  };

  const cities = useMemo(() => [...new Set(rows.map((row) => row.city).filter(Boolean) as string[])].sort(), [rows]);
  const provinces = useMemo(() => [...new Set(rows.map((row) => row.province).filter(Boolean) as string[])].sort(), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || row.display_name.toLowerCase().includes(query) || row.handle.toLowerCase().includes(query);
    const matchesCity = !city || row.city === city;
    const matchesProvince = !province || row.province === province;
    const matchesAgenda = !agendaOnly || agendaChannels.includes(row.id);
    const kinds = channelKinds[row.id] ?? [];
    const matchesKind = kind === 'all' || kinds.includes(kind);
    return matchesQuery && matchesCity && matchesProvince && matchesAgenda && matchesKind;
  }), [rows, search, city, province, agendaOnly, agendaChannels, channelKinds, kind]);

  const swipeRows = filtered.slice(cursor, cursor + 1);
  const activeSwipe = swipeRows[0];

  return (
    <PageFrame icon={Compass} title="Descobrir criadoras" intro="Pesquisa por perfil, localização, tipo de conteúdo e disponibilidade social.">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="grid gap-3 rounded-md border border-bone-50/8 bg-ink-900/70 p-4 md:grid-cols-5">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar perfil" className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50" />
        <select value={city} onChange={(event) => setCity(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50"><option value="">Todas as cidades</option>{cities.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={province} onChange={(event) => setProvince(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50"><option value="">Todas as províncias</option>{provinces.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50"><option value="all">Todos os conteúdos</option><option value="image">Fotografia</option><option value="video">Vídeo</option><option value="audio">Áudio</option></select>
        <label className="flex min-h-11 items-center gap-3 rounded-md bg-ink-800 px-3 text-sm text-bone-300"><input type="checkbox" checked={agendaOnly} onChange={(event) => setAgendaOnly(event.target.checked)} /> Agenda aberta</label>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {filtered.map((row) => {
            const isFollowing = following.includes(row.id);
            return <Ficha key={row.id} variant={activeSwipe?.id === row.id ? 'focus' : 'default'}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xl text-bone-50">{row.display_name}</p>
                  <p className="mt-1 text-sm text-bone-400">@{row.handle}</p>
                  <p className="mt-2 text-sm text-bone-400">{row.city ?? 'Cidade não definida'}{row.bairro ? ' · ' + row.bairro : ''}{row.province ? ' · ' + row.province : ''}</p>
                </div>
              </div>
              {row.bio ? <p className="mt-4 text-sm leading-6 text-bone-300">{row.bio}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={'/c/' + row.handle} className="inline-flex min-h-10 items-center rounded-md border border-bone-50/10 px-3 text-sm text-bone-50 no-underline">Abrir perfil</Link>
                <Botao variant={isFollowing ? 'outline' : 'primary'} type="button" onClick={() => void toggleFollow(row.id)}>{isFollowing ? 'A seguir' : 'Seguir grátis'}</Botao>
              </div>
            </Ficha>;
          })}
          {!filtered.length ? <EstadoVazio title="Nenhuma criadora encontrada" body="Ajusta os filtros ou pesquisa outro perfil." /> : null}
        </div>

        <Ficha variant="focus" className="h-fit">
          <p className="text-xs uppercase tracking-[0.16em] text-bone-500">Swipe de descoberta</p>
          {activeSwipe ? <>
            <p className="mt-3 font-display text-4xl text-bone-50">{activeSwipe.display_name}</p>
            <p className="mt-1 text-sm text-bone-400">@{activeSwipe.handle}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Botao variant="outline" type="button" onClick={() => setCursor((value) => Math.min(filtered.length - 1, value + 1))}>Passar</Botao>
              <Botao type="button" onClick={() => void toggleFollow(activeSwipe.id)}>Seguir</Botao>
            </div>
            <Link to={'/c/' + activeSwipe.handle} className="mt-3 block text-center text-sm text-bone-300 underline underline-offset-4">Abrir perfil</Link>
          </> : <EstadoVazio title="Sem cartões" body="Ajusta os filtros para iniciar o swipe." />}
        </Ficha>
      </div>
    </PageFrame>
  );
}

export function ClientFeedCorePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FeedPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => window.localStorage.getItem('prively.feed.sound') === '1');
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const sb = requireSupabase();
      const result = await sb.from('posts').select('id,channel_id,caption,visibility,price,publish_at,is_story').eq('status', 'published').eq('is_story', false).order('created_at', { ascending: false }).limit(60);
      if (result.error) throw result.error;
      const posts = result.data ?? [];
      const media = posts.length
        ? await sb.from('media_assets').select('id,post_id,kind,thumb_blur_path,watermark_enabled,watermark_text').in('post_id', posts.map((post) => post.id)).is('deleted_at', null).order('created_at', { ascending: true })
        : { data: [], error: null };
      if (media.error) throw media.error;
      const first = new Map<string, typeof media.data[number]>();
      for (const asset of media.data ?? []) if (!first.has(String(asset.post_id))) first.set(String(asset.post_id), asset);

      const hydrated = await Promise.all(posts.map(async (post) => {
        const asset = first.get(String(post.id));
        if (!asset) return { ...post, media: null } as FeedPost;
        if (asset.kind === 'video') {
          const playback = await sb.functions.invoke('get-video-playback-url', {
            body: { asset_id: asset.id },
          });
          if (!playback.error && playback.data?.embed_url) {
            return { ...post, media: {
              assetId: String(asset.id),
              kind: 'video',
              locked: false,
              url: String(playback.data.embed_url),
              thumbnailUrl: null,
              watermark: { enabled: Boolean(asset.watermark_enabled), text: asset.watermark_text },
            } } as FeedPost;
          }
        } else {
          const direct = await sb.functions.invoke('get-media-url', { body: { assetId: asset.id } });
          if (!direct.error && direct.data?.url) {
            return { ...post, media: {
              assetId: String(asset.id),
              kind: asset.kind,
              locked: false,
              url: String(direct.data.url),
              thumbnailUrl: direct.data.thumbnailUrl ?? null,
              watermark: direct.data.watermark ?? { enabled: Boolean(asset.watermark_enabled), text: asset.watermark_text },
            } } as FeedPost;
          }
        }
        const preview = await sb.functions.invoke('get-media-preview', { body: { assetId: asset.id } });
        return { ...post, media: preview.error ? null : {
          assetId: String(asset.id),
          kind: asset.kind,
          locked: Boolean(preview.data?.locked),
          url: preview.data?.url ?? null,
          thumbnailUrl: preview.data?.thumbnailUrl ?? null,
          watermark: preview.data?.watermark ?? { enabled: Boolean(asset.watermark_enabled), text: asset.watermark_text },
        } } as FeedPost;
      }));
      setRows(hydrated);
    };
    void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Falha ao carregar o feed.'));
  }, [user]);

  return <PageFrame icon={FilmStrip} title="Feed" intro="Vídeos curtos e publicações públicas. O som começa desligado e o conteúdo pago permanece protegido.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!rows.length && !error ? <EstadoVazio title="O feed ainda está vazio" body="Publicações públicas aparecem aqui à medida que forem publicadas." /> : null}
    <div className="mx-auto max-w-xl snap-y snap-mandatory space-y-4 overflow-y-auto pb-4 md:max-h-[calc(100vh-10rem)]">
      {rows.map((post) => <article key={post.id} className="snap-start overflow-hidden rounded-xl border border-bone-50/8 bg-ink-900">
        <Link to={'/post/' + post.id} className="block no-underline">
          <div className="relative aspect-[9/16] bg-black">
            {post.media?.kind === 'image' && post.media.url ? <img src={post.media.url} alt={post.caption ?? 'Publicação'} className="h-full w-full object-cover" loading="lazy" /> : null}
            {post.media?.kind === 'video' && post.media.url ? <iframe src={post.media.url} title={post.caption ?? 'Vídeo da publicação'} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full border-0" /> : null}
            {post.media?.kind === 'audio' ? <div className="flex h-full items-center justify-center px-8 text-center text-sm text-bone-300">Áudio disponível na publicação</div> : null}
            {post.media?.locked ? <Cortina priceLabel={post.price ? formatMznFromCents(post.price) : 'Conteúdo bloqueado'} thumbnailUrl={post.media.thumbnailUrl} /> : null}
            {post.media?.watermark?.enabled && post.media.watermark.text ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20"><span className="rotate-[-18deg] select-none text-xl font-semibold tracking-[0.2em] text-white">{post.media.watermark.text}</span></div> : null}
          </div>
        </Link>
        <div className="p-4"><p className="text-sm font-semibold text-bone-50">{post.caption ?? 'Publicação'}</p><p className="mt-1 text-xs text-bone-500">{post.visibility}</p><SocialPostActions postId={post.id} /></div>
      </article>)}
    </div>
  </PageFrame>;
}

export function ClientProfileCorePage({ handle }: { handle: string }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<{ id: string; caption: string | null; visibility: string; price: number | null; is_story: boolean }[]>([]);
  const [tier, setTier] = useState<{ id: string; name: string; price_month: number; discounts: Record<string, number> } | null>(null);
  const [period, setPeriod] = useState(1);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const sb = requireSupabase();
    const channelResult = await sb.from('channels').select('id,owner_id,handle,display_name,bio,city,bairro,province').eq('handle', handle).maybeSingle();
    if (channelResult.error) throw channelResult.error;
    if (!channelResult.data) { setChannel(null); return; }
    setChannel(channelResult.data as Channel);

    const [postsResult, tierResult] = await Promise.all([
      sb.from('posts').select('id,caption,visibility,price,is_story').eq('channel_id', channelResult.data.id).eq('status', 'published').order('created_at', { ascending: false }).limit(50),
      sb.from('subscription_tiers').select('id,name,price_month,discounts').eq('channel_id', channelResult.data.id).eq('rank', 1).maybeSingle(),
    ]);
    if (postsResult.error) throw postsResult.error;
    if (tierResult.error) throw tierResult.error;
    setPosts(postsResult.data ?? []);
    setTier(tierResult.data as typeof tier | null);
  };

  useEffect(() => {
    void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Falha ao carregar perfil.'));
  }, [handle]);

  const subscribe = async () => {
    if (!tier || subscribing) return;
    setSubscribing(true);
    setActionError(null);
    const { error: rpcError } = await requireSupabase().rpc('subscribe_to_tier', {
      _tier: tier.id,
      _period_months: period,
      _idem: 'subscription-ui:' + tier.id + ':' + period + ':' + crypto.randomUUID(),
    });
    if (rpcError) {
      setActionError(rpcError.code ?? rpcError.message);
      setSubscribing(false);
      return;
    }
    setNotice('Subscrição activada.');
    setShowSubscribe(false);
    setSubscribing(false);
  };

  const subscriptionPrice = tier ? Math.round(tier.price_month * period * (1 - (tier.discounts?.[String(period)] ?? 0))) : 0;

  if (error) return <PageFrame title="Perfil" intro="Não foi possível carregar o perfil."><p role="alert" className="text-sm text-danger">{error}</p></PageFrame>;
  if (!channel) return <PageFrame title="Perfil indisponível" intro="O perfil não foi encontrado."><EstadoVazio title="Perfil não encontrado" body="Confirma o identificador do perfil." /></PageFrame>;

  return <PageFrame title={channel.display_name} intro={'@' + channel.handle} detail={channel.bio ?? 'Perfil Prively.'}>
    <Ficha variant="focus">
      <p className="text-sm text-bone-400">{channel.city ?? 'Cidade não definida'}{channel.bairro ? ' · ' + channel.bairro : ''}{channel.province ? ' · ' + channel.province : ''}</p>
      {notice ? <p role="status" className="mt-3 text-sm text-ok">{notice}</p> : null}
      {actionError ? <p role="alert" className="mt-3 text-sm text-danger">{actionError}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao type="button" onClick={() => void requireSupabase().rpc('follow_channel', { _channel: channel.id })}>Seguir grátis</Botao>
        <Link to="/mensagens" className="inline-flex min-h-11 items-center rounded-md border border-bone-50/10 px-4 text-sm text-bone-50 no-underline">Mensagem</Link>
        {tier ? <Botao type="button" onClick={() => setShowSubscribe(true)}>Assinar · {formatMznFromCents(subscriptionPrice)}</Botao> : null}
      </div>
    </Ficha>

    {showSubscribe && tier ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-5">
      <Ficha variant="focus" className="w-full max-w-md p-6">
        <h2 className="font-display text-3xl text-bone-50">Confirmar subscrição</h2>
        <p className="mt-2 text-sm text-bone-300">{tier.name} · preço por período</p>
        <label className="mt-5 block text-sm text-bone-300">Período
          <select value={period} onChange={(event) => setPeriod(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50">
            <option value="1">1 mês</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </select>
        </label>
        <p className="mt-4 font-display text-3xl text-bone-50">{formatMznFromCents(subscriptionPrice)}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variant="outline" type="button" onClick={() => setShowSubscribe(false)}>Cancelar</Botao>
          <Botao type="button" loading={subscribing} onClick={() => void subscribe()}>Confirmar</Botao>
        </div>
      </Ficha>
    </div> : null}

    <div className="mt-6 grid gap-4 md:grid-cols-2">{posts.map((post) => <Ficha key={post.id}><Link to={'/post/' + post.id} className="text-bone-50 no-underline">{post.caption ?? 'Publicação'}</Link><p className="mt-2 text-xs text-bone-500">{post.is_story ? 'Story' : post.visibility}</p>{post.price ? <p className="mt-2 font-display text-xl text-bone-50">{formatMznFromCents(post.price)}</p> : null}</Ficha>)}{!posts.length ? <EstadoVazio title="Sem publicações" body="Esta criadora ainda não publicou conteúdo visível." /> : null}</div>
  </PageFrame>;
}

export function ClientPurchasesCorePage() {
  const [items, setItems] = useState<{ id: string; post_id: string; price_paid: number; created_at: string; caption: string | null }[]>([]);
  const [subs, setSubs] = useState<{ id: string; channel_id: string; period_months: number; price_paid: number; status: string; current_period_end: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      const sb = requireSupabase();
      const [purchases, subscriptions] = await Promise.all([
        sb.from('ppv_purchases').select('id,post_id,price_paid,created_at').order('created_at', { ascending: false }).limit(100),
        sb.from('subscriptions').select('id,channel_id,period_months,price_paid,status,current_period_end').order('created_at', { ascending: false }).limit(100),
      ]);
      if (purchases.error) throw purchases.error;
      if (subscriptions.error) throw subscriptions.error;
      const postIds = (purchases.data ?? []).map((row) => row.post_id);
      const postResult = postIds.length ? await sb.from('posts').select('id,caption').in('id', postIds) : { data: [], error: null };
      if (postResult.error) throw postResult.error;
      const captions = new Map((postResult.data ?? []).map((row) => [String(row.id), row.caption as string | null]));
      setItems((purchases.data ?? []).map((row) => ({ ...row, caption: captions.get(String(row.post_id)) ?? null })));
      setSubs((subscriptions.data ?? []) as typeof subs);
    };
    void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Falha ao carregar compras.'));
  }, []);
  return <PageFrame icon={ShoppingBagOpen} title="Compras e subscrições" intro="Histórico real de PPV e subscrições.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="grid gap-5 lg:grid-cols-2">
      <Ficha><h2 className="text-lg text-bone-50">PPV</h2><div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-md border border-bone-50/8 p-3"><Link to={'/post/' + item.post_id} className="text-sm font-semibold text-bone-50 no-underline">{item.caption ?? 'Conteúdo adquirido'}</Link><p className="mt-1 text-xs text-bone-500">{new Date(item.created_at).toLocaleString('pt-MZ')}</p><p className="mt-2 font-display text-xl text-bone-50">{formatMznFromCents(item.price_paid)}</p></div>)}{!items.length ? <EstadoVazio title="Sem compras PPV" body="Os conteúdos comprados aparecem aqui." /> : null}</div></Ficha>
      <Ficha><h2 className="text-lg text-bone-50">Subscrições</h2><div className="mt-4 space-y-3">{subs.map((item) => <div key={item.id} className="rounded-md border border-bone-50/8 p-3"><p className="text-sm font-semibold text-bone-50">{item.period_months} mês(es) · {item.status}</p><p className="mt-1 text-xs text-bone-500">Até {new Date(item.current_period_end).toLocaleString('pt-MZ')}</p><p className="mt-2 font-display text-xl text-bone-50">{formatMznFromCents(item.price_paid)}</p></div>)}{!subs.length ? <EstadoVazio title="Sem subscrições" body="As subscrições activas e históricas aparecem aqui." /> : null}</div></Ficha>
    </div>
  </PageFrame>;
}

export function ClientWishlistCorePage() {
  const [items, setItems] = useState<{ post_id: string; created_at: string; caption: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const sb = requireSupabase();
    const result = await sb.from('wishlist').select('post_id,created_at').order('created_at', { ascending: false }).limit(100);
    if (result.error) throw result.error;
    const postIds = (result.data ?? []).map((row) => row.post_id);
    const posts = postIds.length ? await sb.from('posts').select('id,caption').in('id', postIds) : { data: [], error: null };
    if (posts.error) throw posts.error;
    const captions = new Map((posts.data ?? []).map((row) => [String(row.id), row.caption as string | null]));
    setItems((result.data ?? []).map((row) => ({ ...row, caption: captions.get(String(row.post_id)) ?? null })));
  };
  useEffect(() => { void load().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Falha ao carregar a lista de desejos.')); }, []);
  const remove = async (postId: string) => {
    const { error: rpcError } = await requireSupabase().rpc('remove_wishlist', { _post: postId });
    if (rpcError) setError(rpcError.message);
    else await load();
  };
  return <PageFrame icon={ShoppingBagOpen} title="Lista de desejos" intro="Guarda conteúdos para rever e comprar mais tarde.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="grid gap-3">{items.map((item) => <Ficha key={item.post_id}><div className="flex items-center justify-between gap-4"><Link to={'/post/' + item.post_id} className="text-bone-50 no-underline">{item.caption ?? 'Publicação guardada'}</Link><Botao variant="ghost" type="button" onClick={() => void remove(item.post_id)}>Remover</Botao></div></Ficha>)}{!items.length ? <EstadoVazio title="Lista vazia" body="Guarda uma publicação para a encontrares aqui." /> : null}</div>
  </PageFrame>;
}

export function ClientAccountCorePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ handle: string; display_name: string; locale: string; currency: string; city: string | null; bairro: string | null } | null>(null);
  const [locale, setLocale] = useState('pt-MZ');
  const [currency, setCurrency] = useState('MZN');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const result = await requireSupabase().from('profiles').select('handle,display_name,locale,currency,city,bairro').eq('id', user.id).maybeSingle();
    if (result.error) setError(result.error.message);
    else if (result.data) {
      setProfile(result.data as typeof profile);
      setLocale(result.data.locale || 'pt-MZ');
      setCurrency(result.data.currency || 'MZN');
    }
  };
  useEffect(() => { void load(); }, [user]);

  const save = async () => {
    if (!user) return;
    const result = await requireSupabase().from('profiles').update({ locale, currency }).eq('id', user.id);
    if (result.error) setError(result.error.message);
    else {
      setMessage('Preferências actualizadas.');
      await i18n.changeLanguage(locale);
      await load();
    }
  };

  return <PageFrame icon={GearSix} title="Conta e preferências" intro="A identidade pública usa o pseudónimo. O email não é mostrado no espaço social.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-ok">{message}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <Ficha variant="focus" className="p-5"><p className="text-xs uppercase tracking-[0.18em] text-bone-500">Pseudónimo</p><p className="mt-2 text-2xl text-bone-50">{profile?.display_name ?? profile?.handle ?? 'Privê'}</p><p className="mt-1 text-sm text-bone-400">@{profile?.handle ?? 'privado'}</p><p className="mt-4 text-sm text-bone-500">{profile?.city ?? 'Cidade não definida'}{profile?.bairro ? ' · ' + profile.bairro : ''}</p></Ficha>
      <Ficha className="p-5"><label className="block text-sm text-bone-300">Idioma<select value={locale} onChange={(event) => setLocale(event.target.value)} className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50"><option value="pt-MZ">Português</option><option value="en">English</option><option value="fr">Français</option></select></label><label className="mt-4 block text-sm text-bone-300">Moeda<select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50"><option value="MZN">MT</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="ZAR">ZAR</option></select></label><Botao className="mt-5" type="button" onClick={() => void save()}>Guardar preferências</Botao></Ficha>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3"><Link to="/verificacao" className="no-underline"><Ficha><p className="text-bone-50">Verificação de identidade</p><p className="mt-1 text-sm text-bone-500">Documento e selfie</p></Ficha></Link><Link to="/definicoes/discreto" className="no-underline"><Ficha><p className="text-bone-50">Modo discreto</p><p className="mt-1 text-sm text-bone-500">Notificações e PIN</p></Ficha></Link><Link to="/definicoes/limites" className="no-underline"><Ficha><p className="text-bone-50">Limites de gasto</p><p className="mt-1 text-sm text-bone-500">Diário, semanal e mensal</p></Ficha></Link></div>
  </PageFrame>;
}

export function ClientLimitsCorePage() {
  const [values, setValues] = useState({ daily: '0', weekly: '0', monthly: '0' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    void requireSupabase().rpc('get_spend_limits').then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else if (data) {
        const limits = data as { daily: number; weekly: number; monthly: number };
        setValues({ daily: String(limits.daily / 100), weekly: String(limits.weekly / 100), monthly: String(limits.monthly / 100) });
      }
    });
  }, []);
  const cents = (value: string) => {
    const next = Math.round(Number(value || '0') * 100);
    if (!Number.isFinite(next) || next < 0) throw new Error('Valor inválido.');
    return next;
  };
  const save = async () => {
    try {
      const result = await requireSupabase().rpc('set_spend_limits', { _daily: cents(values.daily), _weekly: cents(values.weekly), _monthly: cents(values.monthly) });
      if (result.error) throw result.error;
      setNotice('Limites guardados no servidor.');
    } catch (errorValue: unknown) {
      setError(errorValue instanceof Error ? errorValue.message : 'Falha ao guardar limites.');
    }
  };
  const exclude = async (days: number) => {
    const result = await requireSupabase().rpc('start_self_exclusion', {
      _until: new Date(Date.now() + days * 86400000).toISOString(),
      _reason: days === 1 ? 'Pausa de 24 horas' : 'Auto-exclusão de ' + days + ' dias',
    });
    if (result.error) setError(result.error.message);
    else setNotice('Auto-exclusão aplicada pelo servidor.');
  };
  return <PageFrame icon={Money} title="Limites e auto-exclusão" intro="Os limites são aplicados no servidor e impedem novas despesas quando são atingidos.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
    <Ficha className="p-5"><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-bone-300">Diário<input value={values.daily} onChange={(event) => setValues((current) => ({ ...current, daily: event.target.value }))} inputMode="decimal" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" /></label><label className="text-sm text-bone-300">Semanal<input value={values.weekly} onChange={(event) => setValues((current) => ({ ...current, weekly: event.target.value }))} inputMode="decimal" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" /></label><label className="text-sm text-bone-300">Mensal<input value={values.monthly} onChange={(event) => setValues((current) => ({ ...current, monthly: event.target.value }))} inputMode="decimal" className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" /></label></div><Botao className="mt-5" onClick={() => void save()}>Guardar limites</Botao></Ficha>
    <Ficha className="mt-4 p-5"><h2 className="text-lg text-bone-50">Pausa e auto-exclusão</h2><p className="mt-2 text-sm text-bone-400">A aplicação pode bloquear gastos por 24 horas, 7 dias ou 30 dias.</p><div className="mt-4 flex flex-wrap gap-2"><Botao variant="outline" onClick={() => void exclude(1)}>24 horas</Botao><Botao variant="outline" onClick={() => void exclude(7)}>7 dias</Botao><Botao variant="outline" onClick={() => void exclude(30)}>30 dias</Botao></div></Ficha>
  </PageFrame>;
}

export function ClientDiscreetCorePage() {
  const [enabled, setEnabled] = useState(() => window.localStorage.getItem('prively.discreet.enabled') === '1');
  const [pin, setPinValue] = useState('');
  const [hasStoredPin, setHasStoredPin] = useState(() => hasPin());
  const [error, setError] = useState<string | null>(null);

  const savePin = async () => {
    if (!/^[0-9]{6}$/.test(pin)) {
      setError('O PIN deve ter 6 dígitos.');
      return;
    }
    await setPin(pin);
    window.localStorage.setItem('prively.discreet.enabled', '1');
    setEnabled(true);
    setHasStoredPin(true);
    setPinValue('');
    document.title = 'Actividade';
    window.dispatchEvent(new Event('prively:discreet-changed'));
  };

  const toggle = (value: boolean) => {
    setEnabled(value);
    window.localStorage.setItem('prively.discreet.enabled', value ? '1' : '0');
    document.title = value ? 'Actividade' : 'Prively | O teu Privê digital.';
    window.dispatchEvent(new Event('prively:discreet-changed'));
  };

  return <PageFrame icon={LockKey} title="Modo discreto e PIN" intro="Usa um título neutro e prepara o bloqueio local do espaço. O navegador não consegue impedir capturas de ecrã.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Ficha className="p-5">
      <label className="flex items-center justify-between gap-4 text-sm text-bone-300"><span><strong className="block text-bone-50">Modo discreto</strong><span className="text-bone-500">Título neutro e notificações já desenhadas para discrição.</span></span><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} /></label>
      <label className="mt-5 block text-sm text-bone-300">PIN de acesso de 6 dígitos<input value={pin} onChange={(event) => setPinValue(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" maxLength={6} className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50" placeholder={hasStoredPin ? '••••••' : '000000'} /></label>
      <Botao className="mt-4" onClick={() => void savePin()}>Guardar PIN</Botao>
    </Ficha>
  </PageFrame>;
}

export function ClientStoriesCorePage() {
  const [stories, setStories] = useState<{ id: string; caption: string | null; publish_at: string | null; expires_at: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void requireSupabase().from('posts').select('id,caption,publish_at,expires_at').eq('status', 'published').eq('is_story', true).gte('expires_at', new Date().toISOString()).order('publish_at', { ascending: false }).limit(100).then(({ data, error: queryError }) => {
      if (queryError) setError(queryError.message);
      else setStories(data ?? []);
    });
  }, []);
  return <PageFrame title="Stories" intro="Conteúdo temporário com validade de 24 horas.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!stories.length ? <EstadoVazio title="Sem stories activos" body="Os stories visíveis aparecem aqui durante o período publicado." /> : null}
    <div className="grid gap-3">{stories.map((story) => <Ficha key={story.id}><Link to={'/post/' + story.id} className="text-bone-50 no-underline">{story.caption ?? 'Story'}</Link><p className="mt-1 text-xs text-bone-500">{story.expires_at ? 'Expira ' + new Date(story.expires_at).toLocaleString('pt-MZ') : 'Temporário'}</p></Ficha>)}</div>
  </PageFrame>;
}
