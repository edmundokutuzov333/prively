import { CalendarDots, ChartBar, ChartLineUp, ChatCircle, Compass, FilmStrip, GearSix, Gavel, Keyhole, LockKey, Money, NotePencil, ShieldCheck, ShoppingBagOpen, Storefront, UsersThree, VideoCamera, Wallet } from '@phosphor-icons/react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Escudo } from '@/design/Escudo';
import { Selo } from '@/design/Selo';
import { useAuth } from '@/app/session';
import { PageFrame } from '@/pages/PageFrame';

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
  const title = handle ? `@${handle}` : t('experience.pages.profile.title');
  return <><DevSessionNote /><PageFrame icon={UsersThree} title={title} intro={t('experience.pages.profile.intro')} detail={t('experience.pages.profile.detail')} /></>;
}

export function ClientPostPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const title = id ? `Post ${id.slice(0, 8)}` : t('experience.pages.post.title');
  return <><DevSessionNote /><PageFrame icon={LockKey} title={title} intro={t('experience.pages.post.intro')} detail={t('experience.pages.post.detail')} /></>;
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
  return <><PageFrame icon={GearSix} title={t('experience.pages.account.title')} intro={t('experience.pages.account.intro')} detail={t('experience.pages.account.detail')} /><div className="mx-auto mt-4 max-w-6xl"><Ficha className="p-6"><p className="text-xs uppercase tracking-[0.18em] text-bone-500">{t('experience.session.active')}</p><p className="mt-2 truncate text-sm text-bone-50">{user?.email ?? t('experience.session.account')}</p></Ficha></div></>;
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
export function CreatorSettingsPage() { return <CreatorPage page="settings" />; }

export function SeCriadoraPage() {
  const { t } = useTranslation();
  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16"><PageFrame icon={Keyhole} title={t('experience.pages.seCreator.title')} intro={t('experience.pages.seCreator.intro')} detail={t('experience.pages.seCreator.detail')} actionHref="/registo" actionLabel={t('experience.pages.seCreator.action')} /></section>;
}