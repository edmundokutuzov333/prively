import { Globe, Palette, SignIn, UserPlus } from '@phosphor-icons/react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { featureFlags } from '@/config/featureFlags';
import { SessionProvider } from '@/app/session';
import { WorkspaceLayout } from '@/app/WorkspaceLayout';
import { ExperienceGuard } from '@/app/ExperienceGuards';
import { HomePage } from '@/pages/HomePage';
import { AgeGatePage } from '@/pages/AgeGatePage';
import { AuthPage } from '@/pages/AuthPage';
import { DesignSystemPage } from '@/pages/DesignSystemPage';
import { InfoPage } from '@/pages/InfoPage';
import {
  ClientAccountPage,
  ClientDiscoverPage,
  ClientDiscreetPage,
  ClientFeedPage,
  ClientLimitsPage,
  ClientMessagePage,
  ClientMessagesPage,
  ClientPostPage,
  ClientPrivacyPage,
  ClientProfilePage,
  ClientPurchasesPage,
  ClientWalletPage,
  ClientWishlistPage,
  CreatorAgendaPage,
  CreatorAnalyticsPage,
  CreatorAuctionsPage,
  CreatorContentPage,
  CreatorEarningsPage,
  CreatorFansPage,
  CreatorLivesPage,
  CreatorRequestsPage,
  CreatorSettingsPage,
  CreatorStorePage,
  CreatorStudioPage,
  SeCriadoraPage
} from '@/pages/ExperiencePages';
import i18n, { supportedLanguages } from '@/lib/i18n';
import {
  ClientAuctionPage,
  ClientCustomRequestPage,
  ClientLiveListPage,
  ClientLiveRoomPage,
  ClientRewardsPage,
  ClientStorePage,
  ClientWalletRealPage,
  CreatorAnalyticsAdvancedPage,
  CreatorAuctionsAdvancedPage,
  CreatorAutoRepliesPage,
  CreatorFansAdvancedPage,
  CreatorGoalsPage,
  CreatorLiveStudioPage,
  CreatorReferralPage,
  CreatorRequestsAdvancedPage,
  CreatorStoreAdvancedPage
} from '@/pages/Phase3Pages';
import {
  ClientSupportCreatorPage,
  ClientBundlesPage,
  ClientEngagementPage,
  ClientRankingsPage,
  CreatorBundlesPage,
  CreatorEngagementPage,
  CreatorSchedulePage
} from '@/pages/Phase3AdvancedPages';

const phase2RoutesEnabled = import.meta.env.DEV || featureFlags.phase2Experience;
const phase3RoutesEnabled = import.meta.env.DEV || featureFlags.phase3Monetization;

function Header() {
  const { t } = useTranslation();
  const [localeOpen, setLocaleOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isSystem = location.pathname === '/system';

  return <header className="sticky top-0 z-40 border-b border-bone-50/7 bg-ink-950/90 backdrop-blur-xl">
    <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-5 md:px-8">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-crimson-400/40 bg-wine-900 font-display text-lg text-bone-50">P</span>
        <span className="hidden text-sm font-semibold tracking-tight sm:block">{t('brand.name')}</span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link to="/entrar" className="hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm text-bone-300 hover:bg-ink-900 hover:text-bone-50 sm:flex"><SignIn size={18} weight="duotone" />{t('nav.enter')}</Link>
        <Link to="/se-criadora" className="flex min-h-11 items-center gap-2 rounded-md border border-bone-50/10 px-3 text-sm text-bone-50 hover:bg-ink-900"><UserPlus size={18} weight="duotone" />{t('nav.creator')}</Link>
        <div className="relative">
          <button type="button" aria-expanded={localeOpen} aria-label={t('common.language')} onClick={() => setLocaleOpen((open) => !open)} className="flex min-h-11 w-11 items-center justify-center rounded-md text-bone-300 hover:bg-ink-900 hover:text-bone-50"><Globe size={19} weight="duotone" /></button>
          {localeOpen ? <div className="absolute right-0 top-12 z-50 w-36 rounded-md border border-bone-50/10 bg-ink-900 p-1 shadow-2xl">
            {supportedLanguages.map((language) => <button key={language} type="button" className="flex min-h-11 w-full items-center justify-between rounded px-3 text-sm text-bone-300 hover:bg-ink-800 hover:text-bone-50" onClick={() => { void i18n.changeLanguage(language); setLocaleOpen(false); }}>{language}<span className="text-bone-500">{language === 'pt-MZ' ? 'PT' : language.toUpperCase()}</span></button>)}
          </div> : null}
        </div>
        {import.meta.env.DEV && featureFlags.designSystem ? <button type="button" onClick={() => navigate(isSystem ? '/' : '/system')} className="hidden min-h-11 w-11 items-center justify-center rounded-md text-bone-300 hover:bg-ink-900 hover:text-bone-50 md:flex" aria-label={t('nav.designSystem')}><Palette size={19} weight="duotone" /></button> : null}
      </nav>
    </div>
  </header>;
}

export function App() {
  return <SessionProvider><BrowserRouter>
    <Header />
    <main className="min-h-[calc(100vh-4rem)]">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/idade" element={<AgeGatePage />} />
        <Route path="/entrar" element={<AuthPage mode="signIn" />} />
        <Route path="/registo" element={<AuthPage mode="signUp" />} />

        {phase2RoutesEnabled ? <Route element={<ExperienceGuard />}>
          <Route element={<WorkspaceLayout variant="client" />}>
            <Route path="/descobrir" element={<ClientDiscoverPage />} />
            <Route path="/feed" element={<ClientFeedPage />} />
            <Route path="/c/:handle" element={<ClientProfilePage />} />
            <Route path="/post/:id" element={<ClientPostPage />} />
            <Route path="/mensagens" element={<ClientMessagesPage />} />
            <Route path="/mensagens/:id" element={<ClientMessagePage />} />
            <Route path="/carteira" element={phase3RoutesEnabled ? <ClientWalletRealPage /> : <ClientWalletPage />} />
            <Route path="/compras" element={<ClientPurchasesPage />} />
            <Route path="/desejos" element={<ClientWishlistPage />} />
            {phase3RoutesEnabled ? <>
              <Route path="/lives" element={<ClientLiveListPage />} />
              <Route path="/live/:sessionId" element={<ClientLiveRoomPage />} />
              <Route path="/pedidos" element={<ClientCustomRequestPage />} />
              <Route path="/leilao/:auctionId" element={<ClientAuctionPage />} />
              <Route path="/loja" element={<ClientStorePage />} />
              <Route path="/recompensas" element={<ClientRewardsPage />} />
              <Route path="/apoio" element={<ClientSupportCreatorPage />} />
              <Route path="/bundles" element={<ClientBundlesPage />} />
              <Route path="/actividades" element={<ClientEngagementPage />} />
              <Route path="/rankings" element={<ClientRankingsPage />} />
            </> : null}
            <Route path="/definicoes/conta" element={<ClientAccountPage />} />
            <Route path="/definicoes/privacidade" element={<ClientPrivacyPage />} />
            <Route path="/definicoes/limites" element={<ClientLimitsPage />} />
            <Route path="/definicoes/discreto" element={<ClientDiscreetPage />} />
          </Route>
          <Route element={<WorkspaceLayout variant="creator" />}>
            <Route path="/estudio" element={<CreatorStudioPage />} />
            <Route path="/estudio/conteudo" element={<CreatorContentPage />} />
            <Route path="/estudio/loja" element={phase3RoutesEnabled ? <CreatorStoreAdvancedPage /> : <CreatorStorePage />} />
            <Route path="/estudio/agenda" element={<CreatorAgendaPage />} />
            <Route path="/estudio/fas" element={phase3RoutesEnabled ? <CreatorFansAdvancedPage /> : <CreatorFansPage />} />
            <Route path="/estudio/ganhos" element={<CreatorEarningsPage />} />
            <Route path="/estudio/analitica" element={phase3RoutesEnabled ? <CreatorAnalyticsAdvancedPage /> : <CreatorAnalyticsPage />} />
            <Route path="/estudio/pedidos" element={phase3RoutesEnabled ? <CreatorRequestsAdvancedPage /> : <CreatorRequestsPage />} />
            <Route path="/estudio/leiloes" element={phase3RoutesEnabled ? <CreatorAuctionsAdvancedPage /> : <CreatorAuctionsPage />} />
            <Route path="/estudio/lives" element={phase3RoutesEnabled ? <CreatorLiveStudioPage /> : <CreatorLivesPage />} />
            {phase3RoutesEnabled ? <>
              <Route path="/estudio/metas" element={<CreatorGoalsPage />} />
              <Route path="/estudio/referral" element={<CreatorReferralPage />} />
              <Route path="/estudio/respostas" element={<CreatorAutoRepliesPage />} />
              <Route path="/estudio/bundles" element={<CreatorBundlesPage />} />
              <Route path="/estudio/actividades" element={<CreatorEngagementPage />} />
              <Route path="/estudio/agenda-avancada" element={<CreatorSchedulePage />} />
            </> : null}
            <Route path="/estudio/definicoes" element={<CreatorSettingsPage />} />
          </Route>
        </Route> : null}

        {phase2RoutesEnabled ? <Route path="/sobre" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/ajuda" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/termos" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/privacidade" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/conteudo-proibido" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/reembolsos" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/cookies" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/dmca" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/se-criadora" element={<SeCriadoraPage />} /> : <Route path="/se-criadora" element={<Navigate to="/registo" replace />} />}

        {import.meta.env.DEV && featureFlags.designSystem ? <Route path="/system" element={<DesignSystemPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </BrowserRouter></SessionProvider>;
}