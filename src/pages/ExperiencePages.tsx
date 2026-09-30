import { CalendarDots, ChartBar, ChartLineUp, ChatCircle, Compass, FilmStrip, GearSix, Gavel, Keyhole, LockKey, Money, NotePencil, ShieldCheck, ShoppingBagOpen, Storefront, UsersThree, VideoCamera, Wallet } from '@phosphor-icons/react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Escudo } from '@/design/Escudo';
import { Cortina } from '@/design/Cortina';
import { Selo } from '@/design/Selo';
import { useAuth } from '@/app/session';
import { PageFrame } from '@/pages/PageFrame';
import { SocialPostActions } from '@/features/social/SocialPostActions';
import { requireSupabase } from '@/lib/supabase';
import { formatMznFromCents } from '@/lib/money';
import { ReportButton } from '@/features/safety/ReportButton';

function DevSessionNote() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return <div className="mb-6">
    <Ficha variant="flat" className="flex items-center gap-3 px-4 py-3">
      <ShieldCheck size={18} weight="duotone" className="text-crimson-400" />
      <p className="m-0 text-xs leading-5 text-bone-500">{user?.email ?? t('experience.session.preview')} · {t('experience.session.devOnly')}</p>
    </Ficha>
  </div>;
}

export function ClientDiscoverPage() { const { t } = useTranslation(); return <><DevSessionNote /><PageFrame icon={Compass} title={t('experience.pages.discover.title')} intro={t('experience.pages.discover.intro')} detail={t('experience.pages.discover.detail')} /></>; }
export function ClientFeedPage() { const { t } = useTranslation(); return <><DevSessionNote /><PageFrame icon={FilmStrip} title={t('experience.pages.feed.title')} intro={t('experience.pages.feed.intro')} detail={t('experience.pages.feed.detail')} /></>; }

export function ClientProfilePage() {
  const { handle } = useParams();
  const { t } = useTranslation();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const title = handle ? `@${handle}` : t('experience.pages.profile.title');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!handle) return;
      const { data } = await requireSupabase().from('channels').select('owner_id').eq('handle', handle).maybeSingle();
      if (active) setOwnerId(data?.owner_id ?? null);
    };
    void load();
    return () => { active = false; };
  }, [handle]);

  return (
    <>
      <DevSessionNote />
      <PageFrame icon={UsersThree} title={title} intro={t('experience.pages.profile.intro')} detail={t('experience.pages.profile.detail')}>
        {ownerId ? <div className="mt-6"><ReportButton targetType="profile" targetId={ownerId} label="Denunciar perfil" /></div> : null}
      </PageFrame>
    </>
  );
}

type PostDetail = {
  id: string;
  caption: string | null;
  visibility: string;
  price: number | null;
  status: string;
  publish_at: string | null;
  expires_at: string | null;
  is_story: boolean;
  blurhash: string | null;
};

type PostMedia = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  thumb_blur_path: string | null;
  watermark_enabled: boolean;
  watermark_text: string | null;
};

type SignedMedia = {
  assetId: string;
  kind: 'image' | 'video' | 'audio';
  locked?: boolean;
  url?: string | null;
  thumbnailUrl: string | null;
  blurhash?: string | null;
  watermark?: { enabled: boolean; text: string | null };
};

export function ClientPostPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [media, setMedia] = useState<SignedMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<'notFound' | 'forbidden' | 'load'>('load');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    if (!id) {
      setError('notFound');
      setLoading(false);
      return;
    }

    const sb = requireSupabase();
    const postResult = await sb
      .from('posts')
      .select('id,caption,visibility,price,status,publish_at,expires_at,is_story,blurhash')
      .eq('id', id)
      .maybeSingle();

    if (postResult.error || !postResult.data) {
      setError(postResult.error ? 'forbidden' : 'notFound');
      setLoading(false);
      return;
    }

    const mediaResult = await sb
      .from('media_assets')
      .select('id,kind,thumb_blur_path,watermark_enabled,watermark_text')
      .eq('post_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (mediaResult.error) {
      setError('load');
      setLoading(false);
      return;
    }

    const signedResults = await Promise.all(
      (mediaResult.data as PostMedia[]).map(async (asset) => {
        const result = await sb.functions.invoke('get-media-url', { body: { assetId: asset.id } });
        if (!result.error && result.data?.url) {
          return result.data as SignedMedia;
        }

        const preview = await sb.functions.invoke('get-media-preview', {
          body: { assetId: asset.id },
        });

        if (!preview.error && preview.data?.locked && preview.data?.thumbnailUrl) {
          return preview.data as SignedMedia;
        }

        return null;
      }),
    );

    const signedMedia = signedResults.filter((item): item is SignedMedia => item !== null);
    if (mediaResult.data.length > 0 && signedMedia.length === 0) {
      setError('forbidden');
    } else {
      setPost(postResult.data as PostDetail);
      setMedia(signedMedia);
      setError('load');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const unlockPpv = async () => {
    if (!post || post.visibility !== 'ppv' || post.price === null || unlocking) return;
    setUnlocking(true);
    setActionError(null);
    const { error: rpcError } = await requireSupabase().rpc('purchase_ppv', {
      _post: post.id,
      _idem: 'ppv-ui:' + post.id + ':' + crypto.randomUUID(),
    });
    if (rpcError) {
      setActionError(rpcError.code ?? rpcError.message);
      setUnlocking(false);
      return;
    }
    await load();
    setUnlocking(false);
  };

  if (loading) {
    return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8"><p className="text-sm text-bone-500">{t('common.loading')}</p></section>;
  }

  if (!post) {
    return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center px-5 py-12 md:px-8">
      <Ficha variant="focus" className="w-full p-8 text-center">
        <ShieldCheck size={32} className="mx-auto text-crimson-400"/>
        <h1 className="mt-5 font-display text-4xl text-bone-50">{error === 'forbidden' ? t('post.accessDeniedTitle') : t('post.notFoundTitle')}</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-bone-300">{error === 'forbidden' ? t('post.accessDeniedBody') : t('post.notFoundBody')}</p>
        <Link to="/feed" className="mt-6 inline-flex min-h-11 items-center rounded-md border border-bone-50/15 px-4 text-sm font-semibold text-bone-50 no-underline">{t('post.backToFeed')}</Link>
      </Ficha>
    </section>;
  }

  return <section className="mx-auto max-w-5xl space-y-6 px-5 py-10 md:px-8 md:py-14">
    <div>
      <p className="flex items-center gap-2 text-sm text-bone-500"><LockKey size={18} weight="duotone"/>{t('post.eyebrow')}</p>
      <h1 className="mt-4 font-display text-5xl leading-none text-bone-50">{post.caption || t('post.untitled')}</h1>
      <p className="mt-3 text-sm text-bone-500">{t('post.visibilityValues.' + post.visibility)} · {post.is_story ? t('post.story') : t('post.publication')}</p>
    </div>

    {actionError ? <p role="alert" className="text-sm text-danger">{actionError}</p> : null}
    <Ficha variant="focus" className="overflow-hidden p-2 md:p-4">
      {media.length ? <div className="grid gap-4">
        {media.map((asset) => <figure key={asset.assetId} className="relative overflow-hidden rounded-md border border-bone-50/8 bg-black">
          {asset.locked ? (
            <Cortina
              priceLabel={post.visibility === 'ppv' && post.price !== null ? formatMznFromCents(post.price) : t('post.locked')}
              thumbnailUrl={asset.thumbnailUrl}
              state={unlocking ? 'unlocking' : 'locked'}
              onUnlock={post.visibility === 'ppv' ? () => void unlockPpv() : undefined}
            />
          ) : (
            <>
              {asset.kind === 'image' && asset.url ? <img src={asset.url} alt={post.caption || t('post.mediaAlt')} className="max-h-[72vh] w-full object-contain" loading="eager" /> : null}
              {asset.kind === 'video' && asset.url ? <video src={asset.url} poster={asset.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="max-h-[72vh] w-full bg-black" /> : null}
              {asset.kind === 'audio' && asset.url ? <div className="flex min-h-48 items-center justify-center p-8"><audio src={asset.url} controls className="w-full" /></div> : null}
              {asset.watermark?.enabled && asset.watermark.text ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
                <span className="rotate-[-18deg] select-none text-xl font-semibold tracking-[0.2em] text-white">{asset.watermark.text}</span>
              </div> : null}
            </>
          )}
        </figure>)}
      </div> : <div className="p-10 text-center text-sm text-bone-500">{t('post.noMedia')}</div>}
    </Ficha>
    <SocialPostActions postId={post.id} />
  </section>;
}
export function ClientMessagesPage() { const { t } = useTranslation(); return <><DevSessionNote /><PageFrame icon={ChatCircle} title={t('experience.pages.messages.title')} intro={t('experience.pages.messages.intro')} detail={t('experience.pages.messages.detail')} /></>; }

export function ClientMessagePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const title = id ? `${t('experience.pages.message.title')} ${id.slice(0, 8)}` : t('experience.pages.message.title');
  return <><DevSessionNote /><PageFrame icon={ChatCircle} title={title} intro={t('experience.pages.message.intro')} detail={t('experience.pages.message.detail')} /></>;
}

export function ClientWalletPage() {
  const { t } = useTranslation();
  return <><DevSessionNote />
    <Ficha variant="focus" className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div><p className="flex items-center gap-2 text-sm text-bone-500"><Wallet size={19} weight="duotone" />{t('experience.pages.wallet.intro')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('experience.pages.wallet.title')}</h1><p className="mt-5 font-display text-3xl leading-none text-bone-500">{t('experience.pages.wallet.balanceUnavailable')}</p></div>
        <Selo />
      </div>
      <div className="mt-10"><Escudo text={t('experience.pages.wallet.notice')} /></div>
    </Ficha>
    <div className="mx-auto mt-4 max-w-6xl"><EstadoVazio title={t('experience.pages.wallet.empty')} action={t('experience.pages.wallet.detail')} /></div>
  </>;
}

export function ClientPurchasesPage() { const { t } = useTranslation(); return <><DevSessionNote /><PageFrame icon={ShoppingBagOpen} title={t('experience.pages.purchases.title')} intro={t('experience.pages.purchases.intro')} detail={t('experience.pages.purchases.detail')} /></>; }
export function ClientWishlistPage() { const { t } = useTranslation(); return <><DevSessionNote /><PageFrame icon={ShoppingBagOpen} title={t('experience.pages.wishlist.title')} intro={t('experience.pages.wishlist.intro')} detail={t('experience.pages.wishlist.detail')} /></>; }
export function ClientAccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return <><PageFrame icon={GearSix} title={t('experience.pages.account.title')} intro={t('experience.pages.account.intro')} detail={t('experience.pages.account.detail')} /><div className="mx-auto mt-4 max-w-6xl space-y-4"><Ficha className="p-6"><p className="text-xs uppercase tracking-[0.18em] text-bone-500">{t('experience.session.active')}</p><p className="mt-2 truncate text-sm text-bone-50">{user?.email ?? t('experience.session.account')}</p></Ficha><Ficha className="p-6"><Link to="/definicoes/seguranca" className="flex items-center justify-between gap-4 no-underline"><span><p className="text-sm font-semibold text-bone-50">{t('security.account')}</p><p className="mt-1 text-sm text-bone-500">{t('security.body')}</p></span><GearSix size={20} className="text-crimson-400"/></Link></Ficha></div></>;
}
export function ClientPrivacyPage() { const { t } = useTranslation(); return <><PageFrame icon={ShieldCheck} title={t('experience.pages.privacy.title')} intro={t('experience.pages.privacy.intro')} detail={t('experience.pages.privacy.detail')} /><div className="mx-auto mt-4 max-w-6xl"><Escudo text={t('privacy.notice')} /></div></>; }
export function ClientLimitsPage() { const { t } = useTranslation(); return <PageFrame icon={Money} title={t('experience.pages.limits.title')} intro={t('experience.pages.limits.intro')} detail={t('experience.pages.limits.detail')} />; }
export function ClientDiscreetPage() { const { t } = useTranslation(); return <PageFrame icon={LockKey} title={t('experience.pages.discreet.title')} intro={t('experience.pages.discreet.intro')} detail={t('experience.pages.discreet.detail')} />; }

const creatorPages = {
  studio: { icon: ChartBar },
  content: { icon: FilmStrip },
  store: { icon: Storefront },
  agenda: { icon: CalendarDots },
  fans: { icon: UsersThree },
  earnings: { icon: Wallet },
  analytics: { icon: ChartLineUp },
  requests: { icon: NotePencil },
  auctions: { icon: Gavel },
  lives: { icon: VideoCamera },
  settings: { icon: GearSix }
} as const;

type CreatorPageKey = keyof typeof creatorPages;

function CreatorPage({ page }: { page: CreatorPageKey }) {
  const { t } = useTranslation();
  const Icon = creatorPages[page].icon;
  return <><DevSessionNote /><PageFrame icon={Icon} title={t(`experience.pages.creator.${page}.title`)} intro={t(`experience.pages.creator.${page}.intro`)} detail={t(`experience.pages.creator.${page}.detail`)} /></>;
}

export function CreatorStudioPage() { return <CreatorPage page="studio" />; }
export function CreatorContentPage() { return <CreatorPage page="content" />; }
export function CreatorStorePage() { return <CreatorPage page="store" />; }
export function CreatorAgendaPage() { return <CreatorPage page="agenda" />; }
export function CreatorFansPage() { return <CreatorPage page="fans" />; }
export function CreatorEarningsPage() { return <CreatorPage page="earnings" />; }
export function CreatorAnalyticsPage() { return <CreatorPage page="analytics" />; }
export function CreatorRequestsPage() { return <CreatorPage page="requests" />; }
export function CreatorAuctionsPage() { return <CreatorPage page="auctions" />; }
export function CreatorLivesPage() { return <CreatorPage page="lives" />; }
export function CreatorSettingsPage() { const { t } = useTranslation(); return <><CreatorPage page="settings" /><div className="mx-auto mt-4 max-w-6xl"><Ficha className="p-6"><Link to="/estudio/definicoes/seguranca" className="flex items-center justify-between gap-4 no-underline"><span><p className="text-sm font-semibold text-bone-50">{t('security.title')}</p><p className="mt-1 text-sm text-bone-500">{t('security.body')}</p></span><GearSix size={20} className="text-crimson-400"/></Link></Ficha></div></>; }

export function SeCriadoraPage() {
  const { t } = useTranslation();
  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
    <PageFrame
      icon={Keyhole}
      title={t('experience.pages.seCreator.title')}
      intro={t('experience.pages.seCreator.intro')}
      detail={t('experience.pages.seCreator.detail')}
      actionHref="/registo?role=creator"
      actionLabel={t('experience.pages.seCreator.action')}
    />
    <div className="mx-auto mt-4 max-w-6xl rounded-xl border border-bone-50/8 bg-ink-900/50 p-5 text-sm text-bone-300">
      <span>{t('auth.haveAccount')} </span>
      <a href="/entrar?portal=creator" className="text-bone-50 underline underline-offset-4">{t('auth.creatorSignInTitle')}</a>
      <span className="mx-2 text-bone-600">·</span>
      <Link to="/legal/termos-criadoras" className="text-bone-50 underline underline-offset-4">Ler Termos e Condições para Criadoras</Link>
    </div>
  </section>;
}