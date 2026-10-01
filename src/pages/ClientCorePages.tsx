import { useEffect, useMemo, useState } from 'react';
import { Compass, FilmStrip, GearSix, LockKey, Money, ShoppingBagOpen } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Botao } from '@/design/Botao';
import { PageFrame } from '@/pages/PageFrame';
import { Cortina } from '@/design/Cortina';
import { SocialPostActions } from '@/features/social/SocialPostActions';
import { requireSupabase, supabaseProjectRef } from '@/lib/supabase';
import { hasPin, setPin } from '@/lib/pin';
import { formatMznFromCents } from '@/lib/money';
import { platformErrorKey } from '@/lib/errors';
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
  follower_count: number;
  is_following: boolean;
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

function useDiscoveryChannels(filters: {
  search: string;
  city: string;
  bairro: string;
  province: string;
}) {
  const [rows, setRows] = useState<Channel[]>([]);
  const [directoryRows, setDirectoryRows] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    const hasFilters = Boolean(filters.search.trim() || filters.city || filters.bairro || filters.province);
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await requireSupabase().rpc('discover_channels', {
          _search: filters.search.trim() || null,
          _city: filters.city || null,
          _bairro: filters.bairro || null,
          _province: filters.province || null,
          _limit: 100,
          _offset: 0,
        });
        if (rpcError) throw rpcError;
        if (!active) return;
        const next = (data ?? []) as Channel[];
        setRows(next);
        if (!hasFilters) setDirectoryRows(next);
      } catch (errorValue: unknown) {
        if (!active) return;
        setError(i18n.t('phase12Discovery.loadError'));
      } finally {
        if (active) setLoading(false);
      }
    }, hasFilters ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [filters.search, filters.city, filters.bairro, filters.province, reloadNonce]);

  return {
    rows,
    directoryRows,
    error,
    loading,
    reload: () => setReloadNonce((value) => value + 1),
    patchFollowing: (channelId: string, isFollowing: boolean) => {
      const patch = (current: Channel[]) => current.map((row) => row.id === channelId
        ? { ...row, is_following: isFollowing, follower_count: Math.max(0, row.follower_count + (isFollowing ? 1 : -1)) }
        : row);
      setRows(patch);
      setDirectoryRows(patch);
    },
  };
}

export function ClientDiscoverCorePage() {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [bairro, setBairro] = useState('');
  const [province, setProvince] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [agendaOnly, setAgendaOnly] = useState(false);
  const [agendaChannels, setAgendaChannels] = useState<string[]>([]);
  const [channelKinds, setChannelKinds] = useState<Record<string, string[]>>({});
  const [cursor, setCursor] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const { rows, directoryRows, error, loading, reload, patchFollowing } = useDiscoveryChannels({
    search,
    city,
    bairro,
    province,
  });
  const { user } = useAuth();

  useEffect(() => {
    const loadMetadata = async () => {
      const sb = requireSupabase();
      const [availabilityResult, postsResult, mediaResult] = await Promise.all([
        sb.from('availability_slots').select('channel_id,starts_at,ends_at').gte('ends_at', new Date().toISOString()).limit(1000),
        sb.from('posts').select('id,channel_id').eq('status', 'published').eq('is_story', false).limit(1000),
        sb.from('media_assets').select('post_id,kind').is('deleted_at', null).limit(2000),
      ]);
      if (availabilityResult.error) throw availabilityResult.error;
      if (postsResult.error) throw postsResult.error;
      if (mediaResult.error) throw mediaResult.error;

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
    void loadMetadata().catch(() => {
      setActionError(i18n.t('phase12Discovery.loadError'));
    });
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [search, city, bairro, province, kind, agendaOnly]);

  const toggleFollow = async (channelId: string) => {
    if (!user) return;
    setActionError(null);
    const row = rows.find((item) => item.id === channelId);
    if (!row) return;
    const isFollowing = row.is_following;
    const { error: rpcError } = await requireSupabase().rpc(
      isFollowing ? 'unfollow_channel' : 'follow_channel',
      { _channel: channelId },
    );
    if (rpcError) {
      setActionError(i18n.t('phase12Discovery.followError'));
      return;
    }
    patchFollowing(channelId, !isFollowing);
  };

  const cities = useMemo(
    () => [...new Set(directoryRows.map((row) => row.city).filter(Boolean) as string[])].sort(),
    [directoryRows],
  );
  const provinces = useMemo(
    () => [...new Set(directoryRows.map((row) => row.province).filter(Boolean) as string[])].sort(),
    [directoryRows],
  );
  const bairros = useMemo(
    () => [...new Set(directoryRows
      .filter((row) => !city || row.city === city)
      .filter((row) => !province || row.province === province)
      .map((row) => row.bairro)
      .filter(Boolean) as string[])].sort(),
    [directoryRows, city, province],
  );

  const filtered = useMemo(() => rows.filter((row) => {
    const agendaMatch = !agendaOnly || agendaChannels.includes(row.id);
    const kinds = channelKinds[row.id] ?? [];
    const kindMatch = kind === 'all' || kinds.includes(kind);
    return agendaMatch && kindMatch;
  }), [rows, agendaOnly, agendaChannels, channelKinds, kind]);

  const activeSwipe = filtered[cursor];
  const hasFilters = Boolean(search.trim() || city || bairro || province || kind !== 'all' || agendaOnly);
  const scope = [city, bairro].filter(Boolean).join(' · ');

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setBairro('');
    setProvince('');
    setKind('all');
    setAgendaOnly(false);
    setCursor(0);
  };

  const widenLocation = () => {
    setBairro('');
    setCity('');
    setCursor(0);
  };

  return (
    <PageFrame icon={Compass} title={i18n.t('phase12Discovery.title')} intro={i18n.t('phase12Discovery.intro')}>
      {error || actionError ? <p role="alert" className="text-sm text-danger">{error ?? actionError}</p> : null}

      <div className="grid gap-3 rounded-md border border-bone-50/8 bg-ink-900/70 p-4 md:grid-cols-6">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={i18n.t('phase12Discovery.search')}
          className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50 md:col-span-2"
          aria-label={i18n.t('phase12Discovery.search')}
        />
        <select value={city} onChange={(event) => setCity(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50">
          <option value="">{i18n.t('phase12Discovery.allCities')}</option>
          {cities.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={bairro} onChange={(event) => setBairro(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50">
          <option value="">{i18n.t('phase12Discovery.allBairros')}</option>
          {bairros.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={province} onChange={(event) => setProvince(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50">
          <option value="">{i18n.t('phase12Discovery.allProvinces')}</option>
          {provinces.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="min-h-11 rounded-md bg-ink-800 px-3 text-sm text-bone-50">
          <option value="all">{i18n.t('phase12Discovery.allContent')}</option>
          <option value="image">{i18n.t('phase12Discovery.image')}</option>
          <option value="video">{i18n.t('phase12Discovery.video')}</option>
          <option value="audio">{i18n.t('phase12Discovery.audio')}</option>
        </select>
        <label className="flex min-h-11 items-center gap-3 rounded-md bg-ink-800 px-3 text-sm text-bone-300 md:col-span-2">
          <input type="checkbox" checked={agendaOnly} onChange={(event) => setAgendaOnly(event.target.checked)} />
          {i18n.t('phase12Discovery.agendaOpen')}
        </label>
      </div>

      {loading ? <p className="mt-4 text-sm text-bone-500" role="status" aria-live="polite">{i18n.t('phase12Discovery.loading')}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {!loading && !filtered.length ? (
            <Ficha>
              <EstadoVazio
                title={scope ? i18n.t('phase12Discovery.emptyScope', { scope }) : i18n.t('phase12Discovery.emptyTitle')}
                body={i18n.t('phase12Discovery.emptyBody')}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {scope ? <Botao type="button" onClick={widenLocation}>{i18n.t('phase12Discovery.viewWholeCity')}</Botao> : null}
                {hasFilters ? <Botao variant="outline" type="button" onClick={clearFilters}>{i18n.t('phase12Discovery.clearFilters')}</Botao> : null}
                {!directoryRows.length ? <Botao variant="outline" type="button" onClick={reload}>{i18n.t('phase12Discovery.refresh')}</Botao> : null}
              </div>
            </Ficha>
          ) : null}

          {filtered.map((row) => {
            const isFollowing = row.is_following;
            return (
              <Ficha key={row.id} variant={activeSwipe?.id === row.id ? 'focus' : 'default'}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-xl text-bone-50">{row.display_name}</p>
                    <p className="mt-1 text-sm text-bone-400">@{row.handle}</p>
                    <p className="mt-2 text-sm text-bone-400">
                      {row.city ?? 'Cidade não definida'}
                      {row.bairro ? ' · ' + row.bairro : ''}
                      {row.province ? ' · ' + row.province : ''}
                    </p>
                    {row.follower_count > 0 ? (
                      <p className="mt-1 text-xs text-bone-500">
                        {i18n.t('phase12Discovery.followerCount', { count: row.follower_count })}
                      </p>
                    ) : null}
                  </div>
                </div>
                {row.bio ? <p className="mt-4 text-sm leading-6 text-bone-300">{row.bio}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={'/c/' + row.handle} className="inline-flex min-h-10 items-center rounded-md border border-bone-50/10 px-3 text-sm text-bone-50 no-underline">
                    {i18n.t('phase12Discovery.openProfile')}
                  </Link>
                  <Botao
                    variant={isFollowing ? 'outline' : 'primary'}
                    type="button"
                    onClick={() => void toggleFollow(row.id)}
                  >
                    {isFollowing ? i18n.t('phase12Discovery.following') : i18n.t('phase12Discovery.follow')}
                  </Botao>
                </div>
              </Ficha>
            );
          })}
        </div>

        <Ficha variant="focus" className="h-fit">
          <p className="text-xs uppercase tracking-[0.16em] text-bone-500">{i18n.t('phase12Discovery.swipe')}</p>
          {activeSwipe ? (
            <>
              <p className="mt-3 font-display text-4xl text-bone-50">{activeSwipe.display_name}</p>
              <p className="mt-1 text-sm text-bone-400">@{activeSwipe.handle}</p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Botao
                  variant="outline"
                  type="button"
                  onClick={() => setCursor((value) => Math.min(Math.max(filtered.length - 1, 0), value + 1))}
                  disabled={filtered.length <= 1}
                >
                  {i18n.t('phase12Discovery.pass')}
                </Botao>
                <Botao type="button" onClick={() => void toggleFollow(activeSwipe.id)}>
                  {activeSwipe.is_following ? i18n.t('phase12Discovery.following') : i18n.t('phase12Discovery.follow')}
                </Botao>
              </div>
              <Link to={'/c/' + activeSwipe.handle} className="mt-3 block text-center text-sm text-bone-300 underline underline-offset-4">
                {i18n.t('phase12Discovery.openProfile')}
              </Link>
            </>
          ) : (
            <EstadoVazio title={i18n.t('phase12Discovery.noCards')} body={i18n.t('phase12Discovery.noCardsBody')} />
          )}
        </Ficha>
      </div>
    </PageFrame>
  );
}

export function ClientFeedCorePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FeedPost[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  const [tiers, setTiers] = useState<{ id: string; name: string; rank: number; price_month: number; discounts: Record<string, number> }[]>([]);
  const [selectedTier, setSelectedTier] = useState<{ id: string; name: string; rank: number; price_month: number; discounts: Record<string, number> } | null>(null);
  const [period, setPeriod] = useState(1);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const sb = requireSupabase();
    const channelResult = await sb
      .from('channels')
      .select('id,owner_id,handle,display_name,bio,city,bairro,province')
      .eq('handle', handle)
      .maybeSingle();
    if (channelResult.error) throw channelResult.error;
    if (!channelResult.data) {
      setChannel(null);
      return;
    }
    setChannel(channelResult.data as Channel);

    const [postsResult, tierResult] = await Promise.all([
      sb
        .from('posts')
        .select('id,caption,visibility,price,is_story')
        .eq('channel_id', channelResult.data.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50),
      sb
        .from('subscription_tiers')
        .select('id,name,rank,price_month,discounts')
        .eq('channel_id', channelResult.data.id)
        .order('rank', { ascending: true }),
    ]);
    if (postsResult.error) throw postsResult.error;
    if (tierResult.error) throw tierResult.error;
    setPosts(postsResult.data ?? []);
    setTiers((tierResult.data ?? []) as typeof tiers);
  };

  useEffect(() => {
    void load().catch((value: unknown) => setError(platformErrorKey(value)));
  }, [handle]);

  const subscribe = async () => {
    if (!selectedTier || subscribing) return;
    setSubscribing(true);
    setActionError(null);
    const { error: rpcError } = await requireSupabase().rpc('subscribe_to_tier', {
      _tier: selectedTier.id,
      _period_months: period,
      _idem: 'subscription-ui:' + selectedTier.id + ':' + period + ':' + crypto.randomUUID(),
    });
    if (rpcError) {
      setActionError(platformErrorKey(rpcError));
      setSubscribing(false);
      return;
    }
    setNotice(i18n.t('phase3Advanced.tierManager.activated'));
    setShowSubscribe(false);
    setSubscribing(false);
    await load();
  };

  const subscriptionPrice = selectedTier
    ? Math.round(selectedTier.price_month * period * (1 - (selectedTier.discounts?.[String(period)] ?? 0)))
    : 0;

  if (error) return <PageFrame title="Perfil" intro="Não foi possível carregar o perfil."><p role="alert" className="text-sm text-danger">{error}</p></PageFrame>;
  if (!channel) return <PageFrame title="Perfil indisponível" intro="O perfil não foi encontrado."><EstadoVazio title="Perfil não encontrado" body="Confirma o identificador do perfil." /></PageFrame>;

  return <PageFrame title={channel.display_name} intro={'@' + channel.handle} detail={channel.bio ?? 'Perfil Prively.'}>
    <Ficha variant="focus">
      <p className="text-sm text-bone-400">{channel.city ?? 'Cidade não definida'}{channel.bairro ? ' · ' + channel.bairro : ''}{channel.province ? ' · ' + channel.province : ''}</p>
      {notice ? <p role="status" className="mt-3 text-sm text-ok">{notice}</p> : null}
      {actionError ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm text-danger">{i18n.t(actionError)}</p><Link to="/carteira" className="text-sm text-bone-50 underline underline-offset-4">{i18n.t('phase6Spend.topUpAction')}</Link></div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao type="button" onClick={() => void requireSupabase().rpc('follow_channel', { _channel: channel.id })}>Seguir grátis</Botao>
        <Link to="/mensagens" className="inline-flex min-h-11 items-center rounded-md border border-bone-50/10 px-4 text-sm text-bone-50 no-underline">Mensagem</Link>
      </div>
    </Ficha>

    <Ficha className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg text-bone-50">{i18n.t('phase3Advanced.support.subscriptionsTitle')}</h2>
          <p className="mt-1 text-sm text-bone-500">{i18n.t('phase3Advanced.tierManager.clientIntro')}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {tiers.map((tier) => (
          <div key={tier.id} className="rounded-md border border-bone-50/8 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-bone-500">Tier {tier.rank}</p>
            <p className="mt-2 text-2xl text-bone-50">{tier.name}</p>
            <p className="mt-2 font-display text-2xl text-bone-50">{formatMznFromCents(tier.price_month)} {i18n.t('phase3Advanced.tierManager.perMonth')}</p>
            <p className="mt-2 text-xs text-bone-500">
              3m · {Math.round((tier.discounts?.['3'] ?? 0) * 100)}% · 6m · {Math.round((tier.discounts?.['6'] ?? 0) * 100)}% · 12m · {Math.round((tier.discounts?.['12'] ?? 0) * 100)}%
            </p>
            <Botao
              className="mt-4"
              type="button"
              onClick={() => {
                setSelectedTier(tier);
                setPeriod(1);
                setActionError(null);
                setShowSubscribe(true);
              }}
            >
              {i18n.t('phase3Advanced.tierManager.subscribe')}
            </Botao>
          </div>
        ))}
      </div>
      {!tiers.length ? <EstadoVazio title={i18n.t('phase3Advanced.support.noTiers')} body={i18n.t('phase3Advanced.support.noTiersBody')} /> : null}
    </Ficha>

    {showSubscribe && selectedTier ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-5">
      <Ficha variant="focus" className="w-full max-w-md p-6">
        <h2 className="font-display text-3xl text-bone-50">{i18n.t('phase3Advanced.tierManager.confirmTitle')}</h2>
        <p className="mt-2 text-sm text-bone-300">{selectedTier.name} · {i18n.t('phase3Advanced.tierManager.price')}</p>
        <label className="mt-5 block text-sm text-bone-300">{i18n.t('phase3Advanced.tierManager.period')}
          <select value={period} onChange={(event) => setPeriod(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-md bg-ink-800 px-3 text-bone-50">
            <option value="1">{i18n.t('phase3Advanced.tierManager.period1')}</option>
            <option value="3">{i18n.t('phase3Advanced.tierManager.period3')}</option>
            <option value="6">{i18n.t('phase3Advanced.tierManager.period6')}</option>
            <option value="12">{i18n.t('phase3Advanced.tierManager.period12')}</option>
          </select>
        </label>
        <p className="mt-4 font-display text-3xl text-bone-50">{formatMznFromCents(subscriptionPrice)}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variant="outline" type="button" onClick={() => setShowSubscribe(false)}>{i18n.t('phase3Advanced.tierManager.cancel')}</Botao>
          <Botao type="button" loading={subscribing} onClick={() => void subscribe()}>{i18n.t('phase3Advanced.tierManager.confirm')}</Botao>
        </div>
      </Ficha>
    </div> : null}

    <div className="mt-6 grid gap-4 md:grid-cols-2">{posts.map((post) => <Ficha key={post.id}><Link to={'/post/' + post.id} className="text-bone-50 no-underline">{post.caption ?? 'Publicação'}</Link><p className="mt-2 text-xs text-bone-500">{post.is_story ? 'Story' : post.visibility}</p>{post.price ? <p className="mt-2 font-display text-xl text-bone-50">{formatMznFromCents(post.price)}</p> : null}</Ficha>)}{!posts.length ? <EstadoVazio title="Sem publicações" body="Esta criadora ainda não publicou conteúdo visível." /> : null}</div>
  </PageFrame>;
}

export function ClientPurchasesCorePage() {
  type HistoryItem = {
    id: string;
    type: 'ppv' | 'subscription';
    createdAt: string;
    amount: number;
    title: string;
    detail: string;
    status: string;
    href: string | null;
    receiptId: string | null;
  };

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Maputo',
  }).format(new Date(value));

  const load = async () => {
    const sb = requireSupabase();
    const [purchasesResult, subscriptionsResult, receiptsResult, ledgerResult] = await Promise.all([
      sb.from('ppv_purchases')
        .select('id,post_id,price_paid,txn_id,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      sb.from('subscriptions')
        .select('id,subscriber_id,channel_id,tier_id,period_months,price_paid,status,current_period_end,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      sb.from('receipts')
        .select('id,txn_id,kind,amount,currency,created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      sb.from('ledger_entries')
        .select('txn_id,amount,kind,ref_type,ref_id,created_at')
        .eq('kind', 'subscription')
        .lt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (purchasesResult.error) throw purchasesResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (receiptsResult.error) throw receiptsResult.error;
    if (ledgerResult.error) throw ledgerResult.error;

    const postIds = [...new Set((purchasesResult.data ?? []).map((row) => String(row.post_id)))];
    const channelIds = [...new Set((subscriptionsResult.data ?? []).map((row) => String(row.channel_id)))];
    const tierIds = [...new Set((subscriptionsResult.data ?? []).map((row) => String(row.tier_id)))];

    const [postsResult, channelsResult, tiersResult] = await Promise.all([
      postIds.length
        ? sb.from('posts').select('id,caption').in('id', postIds)
        : Promise.resolve({ data: [], error: null }),
      channelIds.length
        ? sb.from('channels').select('id,handle,display_name').in('id', channelIds)
        : Promise.resolve({ data: [], error: null }),
      tierIds.length
        ? sb.from('subscription_tiers').select('id,name').in('id', tierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (postsResult.error) throw postsResult.error;
    if (channelsResult.error) throw channelsResult.error;
    if (tiersResult.error) throw tiersResult.error;

    const captions = new Map((postsResult.data ?? []).map((row) => [String(row.id), row.caption as string | null]));
    const channels = new Map((channelsResult.data ?? []).map((row) => [String(row.id), row]));
    const tiers = new Map((tiersResult.data ?? []).map((row) => [String(row.id), row]));
    const receiptsByTxn = new Map((receiptsResult.data ?? []).map((row) => [String(row.txn_id), row]));

    const subscriptionLedger = (ledgerResult.data ?? []).map((row) => ({
      ...row,
      amount: Number(row.amount),
      created_at: String(row.created_at),
      txn_id: String(row.txn_id),
      ref_id: row.ref_id ? String(row.ref_id) : null,
    }));

    const subscriptionItems = (subscriptionsResult.data ?? []).map((row) => {
      const tierId = String(row.tier_id);
      const candidates = subscriptionLedger
        .filter((entry) => entry.ref_id === tierId && Math.abs(entry.amount) === Number(row.price_paid))
        .sort((a, b) => Math.abs(new Date(a.created_at).getTime() - new Date(String(row.created_at)).getTime())
          - Math.abs(new Date(b.created_at).getTime() - new Date(String(row.created_at)).getTime()));
      const ledger = candidates[0];
      const channel = channels.get(String(row.channel_id));
      const tier = tiers.get(tierId);
      const receipt = ledger ? receiptsByTxn.get(ledger.txn_id) : undefined;

      return {
        id: String(row.id),
        type: 'subscription' as const,
        createdAt: String(row.created_at),
        amount: Number(row.price_paid),
        title: [tier?.name, channel?.display_name].filter(Boolean).join(' · ') || i18n.t('phase10Ppv.subscription'),
        detail: i18n.t('phase10Ppv.period', { count: row.period_months }),
        status: String(row.status),
        href: null,
        receiptId: receipt?.id ? String(receipt.id) : null,
      };
    });

    const ppvItems = (purchasesResult.data ?? []).map((row) => {
      const receipt = receiptsByTxn.get(String(row.txn_id));
      return {
        id: String(row.id),
        type: 'ppv' as const,
        createdAt: String(row.created_at),
        amount: Number(row.price_paid),
        title: captions.get(String(row.post_id)) ?? i18n.t('phase10Ppv.contentPurchased'),
        detail: i18n.t('phase10Ppv.ppv'),
        status: i18n.t('phase10Ppv.paid'),
        href: '/post/' + String(row.post_id),
        receiptId: receipt?.id ? String(receipt.id) : null,
      };
    });

    setItems([...ppvItems, ...subscriptionItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
  };

  useEffect(() => {
    void load().catch((value: unknown) => setError(value instanceof Error ? value.message : i18n.t('phase10Ppv.loadError')));
  }, []);

  const downloadReceipt = async (receiptId: string) => {
    setDownloading(receiptId);
    setError(null);
    try {
      const sb = requireSupabase();
      const { data: sessionData, error: sessionError } = await sb.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('session_required');

      const response = await fetch(`https://${supabaseProjectRef}.supabase.co/functions/v1/financial-export`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: 'receipt_pdf', receiptId }),
      });

      if (!response.ok) {
        let code = 'financial_export_failed';
        try {
          const body = await response.json() as { code?: unknown };
          if (typeof body.code === 'string') code = body.code;
        } catch {
          // Keep the generic export failure.
        }
        throw new Error(code);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] ?? 'prively-recibo.pdf';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (value: unknown) {
      setError(i18n.t(platformErrorKey(value)));
    } finally {
      setDownloading(null);
    }
  };

  return <PageFrame icon={ShoppingBagOpen} title={i18n.t('phase10Ppv.title')} intro={i18n.t('phase10Ppv.intro')}>
    {error ? <p role="alert" className="text-sm text-danger">{i18n.t(platformErrorKey(error))}</p> : null}
    <div className="space-y-3">
      {!items.length && !error ? <EstadoVazio title={i18n.t('phase10Ppv.emptyTitle')} body={i18n.t('phase10Ppv.emptyBody')} /> : null}
      {items.map((item) => (
        <Ficha key={item.type + ':' + item.id}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-bone-500">{item.type === 'ppv' ? i18n.t('phase10Ppv.ppv') : i18n.t('phase10Ppv.subscription')}</p>
              {item.href
                ? <Link to={item.href} className="mt-1 block truncate text-lg font-semibold text-bone-50 no-underline">{item.title}</Link>
                : <p className="mt-1 truncate text-lg font-semibold text-bone-50">{item.title}</p>}
              <p className="mt-1 text-sm text-bone-400">{item.detail} · {item.status}</p>
              <p className="mt-1 text-xs text-bone-500">{formatDate(item.createdAt)}</p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <p className="font-display text-2xl text-bone-50">{formatMznFromCents(item.amount)}</p>
              {item.receiptId
                ? <Botao variant="outline" type="button" loading={downloading === item.receiptId} onClick={() => void downloadReceipt(item.receiptId!)}>
                    {i18n.t('phase10Ppv.downloadReceipt')}
                  </Botao>
                : <span className="text-xs text-bone-500">{i18n.t('phase10Ppv.receiptUnavailable')}</span>}
            </div>
          </div>
        </Ficha>
      ))}
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
