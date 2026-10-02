import { Globe, Palette, SignIn, UserPlus } from '@phosphor-icons/react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { featureFlags } from '@/config/featureFlags';
import { SessionProvider } from '@/app/session';
import { AdminGuard } from '@/app/AdminGuard';
import { FinanceGuard } from '@/app/FinanceGuard';
import { WorkspaceLayout } from '@/app/WorkspaceLayout';
import { ExperienceGuard } from '@/app/ExperienceGuards';
import { HomePage } from '@/pages/HomePage';
import { ContentStudioPage } from '@/pages/ContentStudioPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { RecoveryPage } from '@/pages/RecoveryPage';
import { VerificationPage } from '@/pages/VerificationPage';
import { SecuritySettingsPage } from '@/pages/SecuritySettingsPage';
import { AdminMfaPage } from '@/pages/AdminMfaPage';
import { FeatureFlagsAdminPage } from '@/pages/FeatureFlagsAdminPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminKycPage } from '@/pages/AdminKycPage';
import { AdminMediaQueuePage } from '@/pages/AdminMediaQueuePage';
import { AdminAuditPage } from '@/pages/AdminAuditPage';
import { AgeGatePage } from '@/pages/AgeGatePage';
import { AuthPage } from '@/pages/AuthPage';
import { DesignSystemPage } from '@/pages/DesignSystemPage';
import { FeatureRouteResolver } from '@/app/routes';
import BecomeCreator from '@/features/public/BecomeCreator';
import CreatorProfile from '@/features/client/CreatorProfile';
import CreatorProfileEditor from '@/features/creator/Profile';
import { InfoPage } from '@/pages/InfoPage';
import { SurfaceStatePage } from '@/pages/SurfacePages';
import { CreatorTermsPage } from '@/pages/CreatorTermsPage';
import {
  ClientPostPage,
  ClientPrivacyPage,
  ClientWalletPage,
  CreatorAgendaPage,
  CreatorAnalyticsPage,
  CreatorAuctionsPage,
  CreatorEarningsPage,
  CreatorFansPage,
  CreatorRequestsPage,
  CreatorSettingsPage,
  CreatorStorePage,
  CreatorStudioPage
} from '@/pages/ExperiencePages';
import i18n, { supportedLanguages } from '@/lib/i18n';
import {
  ClientAuctionPage,
  ClientLiveListPage,
  ClientLiveRoomPage,
  ClientWalletRealPage,
  CreatorAnalyticsAdvancedPage,
  CreatorAuctionsAdvancedPage,
  CreatorAutoRepliesPage,
  CreatorFansAdvancedPage,
  CreatorLiveStudioPage,
  CreatorRequestsAdvancedPage,
  CreatorStoreAdvancedPage
} from '@/pages/Phase3Pages';
import {
  ClientSupportCreatorPage,
  ClientEngagementPage,
  ClientRankingsPage,
  CreatorBundlesPage,
  CreatorEngagementPage,
  CreatorSchedulePage
} from '@/pages/Phase3AdvancedPages';
import { Phase7MessagePage, Phase7MessagesPage, Phase7NotificationsPage } from '@/pages/Phase7CommunicationPages';
import {
  Phase8ClientMeetingsPage,
  Phase8CompliancePage,
  Phase8CreatorMeetingsPage,
  Phase8CreatorSafetyPage,
  Phase8DmcaPage,
  Phase8EmergenciesPage,
  Phase8LegalHoldsPage,
  Phase8ModerationPage,
  Phase8MyReportsPage,
  Phase8SafeVenuesPage,
} from '@/pages/Phase8SafetyPages';
import {
  Phase6ClientWalletPage,
  Phase6CreatorEarningsPage,
  Phase6FinanceAdminPage,
} from '@/pages/Phase6FinancialPages';
import { Phase10ProductionReadinessPage } from '@/pages/Phase10ProductionReadinessPage';
import { ClientDiscoverCorePage, ClientFeedCorePage, ClientProfileCorePage, ClientPurchasesCorePage, ClientWishlistCorePage, ClientAccountCorePage, ClientLimitsCorePage, ClientDiscreetCorePage, ClientStoriesCorePage } from '@/pages/ClientCorePages';
import { CreatorSafetyControlsPage } from '@/pages/CreatorSafetyControlsPage';
import { CreatorSubscriptionSettingsPage } from '@/pages/CreatorSubscriptionSettingsPage';
import { SupportPage } from '@/pages/SupportPage';
import { AdminStoragePage } from '@/pages/AdminStoragePage';
import {
  Phase9AdminBusinessPage,
  Phase9AgencyPage,
  Phase9BusinessIntegrationsPage,
  Phase9ClientAuctionsPage,
  Phase9ClientBundlesPage,
  Phase9ClientGiveawaysPage,
  Phase9ClientGiftsPage,
  Phase9ClientLoyaltyPage,
  Phase9ClientPremiumPage,
  Phase9ClientRequestsPage,
  Phase9ClientStorePage,
  Phase9CreatorAnalyticsPage,
  Phase9CreatorAuctionsPage,
  Phase9CreatorFansPage,
  Phase9CreatorGoalsPage,
  Phase9CreatorPromotionsPage,
  Phase9CreatorReferralPage,
  Phase9CreatorRequestsPage,
  Phase9CreatorStorePage,
} from '@/pages/Phase9BusinessPages';

const phase2RoutesEnabled = featureFlags.phase2Experience || import.meta.env.DEV;
const phase3RoutesEnabled = featureFlags.phase3Monetization || featureFlags.phase9Business;
const liveRoutesEnabled = featureFlags.live;
const phase9RoutesEnabled = featureFlags.phase9Business;
const stateSurfaceRoutes = [
  '/estado/403',
  '/estado/404',
  '/estado/offline',
  '/estado/erro',
  '/estado/acesso-negado',
  '/estado/suspensa',
  '/estado/banida',
  '/estado/kyc-rejeitado',
  '/estado/kyc-pendente',
  '/estado/pagamento-falhou',
  '/estado/pagamento-pendente',
  '/estado/saldo-insuficiente',
  '/estado/utilizador-bloqueado',
  '/estado/conteudo-removido',
  '/estado/denuncia-submetida',
  '/estado/disputa',
  '/estado/reembolso',
  '/estado/levantamento-falhou',
  '/estado/levantamento-pendente',
  '/estado/auto-exclusao'
] as const;


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
          <button type="button" data-testid="language-selector" aria-expanded={localeOpen} aria-label={t('common.language')} onClick={() => setLocaleOpen((open) => !open)} className="flex min-h-11 w-11 items-center justify-center rounded-md text-bone-300 hover:bg-ink-900 hover:text-bone-50"><Globe size={19} weight="duotone" /></button>
          {localeOpen ? <div className="absolute right-0 top-12 z-50 w-36 rounded-md border border-bone-50/10 bg-ink-900 p-1 shadow-2xl">
            {supportedLanguages.map((language) => <button key={language} type="button" aria-label={language === 'pt-MZ' ? 'PT' : language.toUpperCase()} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-sm text-bone-300 hover:bg-ink-800 hover:text-bone-50" onClick={() => { void i18n.changeLanguage(language); setLocaleOpen(false); }}><span>{language}</span><span className="text-bone-500">{language === 'pt-MZ' ? 'PT' : language.toUpperCase()}</span></button>)}
          </div> : null}
        </div>
        {import.meta.env.DEV && featureFlags.designSystem ? <button type="button" onClick={() => navigate(isSystem ? '/' : '/system')} className="hidden min-h-11 w-11 items-center justify-center rounded-md text-bone-300 hover:bg-ink-900 hover:text-bone-50 md:flex" aria-label={t('nav.designSystem')}><Palette size={19} weight="duotone" /></button> : null}
      </nav>
    </div>
  </header>;
}

function ClientProfileRoutePage() {
  const { handle = '' } = useParams<{ handle: string }>();
  return <ClientProfileCorePage handle={handle} />;
}

export function App() {
  return <SessionProvider><BrowserRouter>
    <Header />
    <main className="min-h-[calc(100vh-4rem)]">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/idade" element={<AgeGatePage />} />
        <Route path="/entrar" element={<AuthPage mode="signIn" portal="client" />} />
        <Route path="/registo" element={<AuthPage mode="signUp" portal="client" />} />
        <Route path="/admin/entrar" element={<AuthPage mode="signIn" portal="admin" />} />
        <Route path="/recuperar" element={<RecoveryPage />} />

        {!featureFlags.referral ? <Route path="/estudio/referral" element={<Navigate to="/404" replace />} /> : null}
        {!featureFlags.agency ? <Route path="/admin/agencia" element={<Navigate to="/404" replace />} /> : null}
        {!liveRoutesEnabled ? <>
          <Route path="/lives" element={<Navigate to="/404" replace />} />
          <Route path="/live-privada" element={<Navigate to="/404" replace />} />
          <Route path="/chamadas" element={<Navigate to="/404" replace />} />
          <Route path="/estudio/lives" element={<Navigate to="/404" replace />} />
          <Route path="/estudio/chamadas" element={<Navigate to="/404" replace />} />
        </> : null}

        <Route element={<ExperienceGuard />}>
          <Route element={<WorkspaceLayout key="client-workspace" variant="client" />}>
            <Route path="/c/:handle" element={<CreatorProfile />} />
          </Route>
          <Route element={<WorkspaceLayout key="creator-workspace" variant="creator" />}>
            <Route path="/estudio/conteudo" element={<ContentStudioPage />} />
            <Route path="/estudio/perfil" element={<CreatorProfileEditor />} />
          </Route>
        </Route>

        {phase2RoutesEnabled ? <Route element={<ExperienceGuard />}>
          <Route element={<WorkspaceLayout variant="client" />}>
            <Route path="/descobrir" element={<ClientDiscoverCorePage />} />
            <Route path="/feed" element={<ClientFeedCorePage />} />
            <Route path="/c/:handle" element={<ClientProfileRoutePage />} />
            <Route path="/post/:id" element={<ClientPostPage />} />
            <Route path="/mensagens" element={<Phase7MessagesPage />} />
            <Route path="/mensagens/:id" element={<Phase7MessagePage />} />
            <Route path="/notificacoes" element={<Phase7NotificationsPage />} />
            <Route path="/encontros" element={<Phase8ClientMeetingsPage />} />
            <Route path="/denuncias" element={<Phase8MyReportsPage />} />
            <Route path="/carteira" element={featureFlags.phase6Financials ? <Phase6ClientWalletPage /> : phase3RoutesEnabled ? <ClientWalletRealPage /> : <ClientWalletPage />} />
            <Route path="/compras" element={<ClientPurchasesCorePage />} />
            <Route path="/desejos" element={<ClientWishlistCorePage />} />
            {liveRoutesEnabled ? <>
              <Route path="/lives" element={<ClientLiveListPage />} />
              <Route path="/live/:sessionId" element={<ClientLiveRoomPage />} />
            </> : null}
            {phase3RoutesEnabled ? <>
              <Route path="/leilao/:auctionId" element={<ClientAuctionPage />} />
              <Route path="/apoio" element={<ClientSupportCreatorPage />} />
              <Route path="/actividades" element={<ClientEngagementPage />} />
              <Route path="/rankings" element={<ClientRankingsPage />} />
            </> : null}
            {phase9RoutesEnabled ? <>
              <Route path="/pedidos" element={<Phase9ClientRequestsPage />} />
              <Route path="/loja" element={<Phase9ClientStorePage />} />
              <Route path="/leiloes" element={<Phase9ClientAuctionsPage />} />
              <Route path="/sorteios" element={<Phase9ClientGiveawaysPage />} />
              <Route path="/presentes" element={<Phase9ClientGiftsPage />} />
              <Route path="/fidelidade" element={<Phase9ClientLoyaltyPage />} />
              <Route path="/premium" element={<Phase9ClientPremiumPage />} />
              <Route path="/recompensas" element={<Phase9ClientLoyaltyPage />} />
              <Route path="/bundles" element={<Phase9ClientBundlesPage />} />
            </> : null}
            <Route path="/definicoes/conta" element={<ClientAccountCorePage />} />
            <Route path="/definicoes/privacidade" element={<ClientPrivacyPage />} />
            <Route path="/definicoes/limites" element={<ClientLimitsCorePage />} />
            <Route path="/definicoes/discreto" element={<ClientDiscreetCorePage />} />
            <Route path="/definicoes/seguranca" element={<SecuritySettingsPage />} />
            <Route path="/verificacao" element={<VerificationPage />} />
            
            <Route path="/onboarding" element={<ClientAccountCorePage />} />
            <Route path="/pesquisa" element={<ClientDiscoverCorePage />} />
            <Route path="/subscricoes" element={<ClientSupportCreatorPage />} />
            <Route path="/tiers" element={<ClientSupportCreatorPage />} />
            <Route path="/ppv" element={<ClientFeedCorePage />} />
            <Route path="/comentarios" element={<ClientFeedCorePage />} />
            <Route path="/reaccoes" element={<ClientFeedCorePage />} />
            <Route path="/sorteios" element={<Phase9ClientGiveawaysPage />} />
            <Route path="/enquetes" element={<ClientEngagementPage />} />
            <Route path="/ranking-fas" element={<ClientRankingsPage />} />
            <Route path="/notificacoes" element={<Phase7NotificationsPage />} />
            <Route path="/denuncias" element={<Phase8MyReportsPage />} />
            <Route path="/mensagens/bloqueadas" element={<Phase7MessagesPage />} />
            {liveRoutesEnabled ? <>
              <Route path="/live-privada" element={<ClientLiveListPage />} />
              <Route path="/chamadas" element={<ClientLiveListPage />} />
            </> : null}
            <Route path="/recarga" element={<Phase6ClientWalletPage />} />
            <Route path="/historico-carteira" element={<Phase6ClientWalletPage />} />
            <Route path="/recibos" element={<Phase6ClientWalletPage />} />
            <Route path="/moeda" element={<ClientAccountCorePage />} />
            <Route path="/pausa" element={<ClientLimitsCorePage />} />
            <Route path="/auto-exclusao" element={<ClientLimitsCorePage />} />
            <Route path="/modo-neutro" element={<ClientDiscreetCorePage />} />
            <Route path="/stories" element={<ClientStoriesCorePage />} />
          </Route>
          <Route element={<WorkspaceLayout variant="creator" />}>
            <Route path="/estudio" element={<CreatorStudioPage />} />
            <Route path="/estudio/conteudo" element={<ContentStudioPage />} />
            <Route path="/estudio/loja" element={phase9RoutesEnabled ? <Phase9CreatorStorePage /> : phase3RoutesEnabled ? <CreatorStoreAdvancedPage /> : <CreatorStorePage />} />
            <Route path="/estudio/agenda" element={<CreatorAgendaPage />} />
            <Route path="/estudio/fas" element={phase9RoutesEnabled ? <Phase9CreatorFansPage /> : phase3RoutesEnabled ? <CreatorFansAdvancedPage /> : <CreatorFansPage />} />
            <Route path="/estudio/mensagens" element={<Phase7MessagesPage />} />
            <Route path="/estudio/mensagens/:id" element={<Phase7MessagePage />} />
            <Route path="/estudio/encontros" element={<Phase8CreatorMeetingsPage />} />
            <Route path="/estudio/check-in" element={<Phase8CreatorSafetyPage />} />
            <Route path="/estudio/panico" element={<Phase8CreatorSafetyPage />} />
            <Route path="/estudio/ganhos" element={featureFlags.phase6Financials ? <Phase6CreatorEarningsPage /> : <CreatorEarningsPage />} />
            <Route path="/estudio/analitica" element={phase9RoutesEnabled ? <Phase9CreatorAnalyticsPage /> : phase3RoutesEnabled ? <CreatorAnalyticsAdvancedPage /> : <CreatorAnalyticsPage />} />
            <Route path="/estudio/pedidos" element={phase9RoutesEnabled ? <Phase9CreatorRequestsPage /> : phase3RoutesEnabled ? <CreatorRequestsAdvancedPage /> : <CreatorRequestsPage />} />
            <Route path="/estudio/leiloes" element={phase9RoutesEnabled ? <Phase9CreatorAuctionsPage /> : phase3RoutesEnabled ? <CreatorAuctionsAdvancedPage /> : <CreatorAuctionsPage />} />
            {liveRoutesEnabled ? <Route path="/estudio/lives" element={<CreatorLiveStudioPage />} /> : null}
            {phase3RoutesEnabled ? <>
              <Route path="/estudio/respostas" element={<CreatorAutoRepliesPage />} />
              <Route path="/estudio/bundles" element={<CreatorBundlesPage />} />
              <Route path="/estudio/actividades" element={<CreatorEngagementPage />} />
              <Route path="/estudio/agenda-avancada" element={<CreatorSchedulePage />} />
            </> : null}
            {phase9RoutesEnabled ? <>
              <Route path="/estudio/metas" element={<Phase9CreatorGoalsPage />} />
              {featureFlags.referral ? <Route path="/estudio/referral" element={<Phase9CreatorReferralPage />} /> : null}
              <Route path="/estudio/promocoes" element={<Phase9CreatorPromotionsPage />} />
              <Route path="/estudio/integracoes" element={<Phase9BusinessIntegrationsPage />} />
            </> : null}
            <Route path="/estudio/definicoes" element={<CreatorSettingsPage />} />
            <Route path="/estudio/definicoes/subscricoes" element={<CreatorSubscriptionSettingsPage />} />
            <Route path="/estudio/definicoes/seguranca" element={<SecuritySettingsPage />} />
            <Route path="/estudio/onboarding" element={<ContentStudioPage />} />
            <Route path="/estudio/vip" element={<ContentStudioPage />} />
            <Route path="/estudio/mural" element={<ContentStudioPage />} />
            <Route path="/estudio/stories" element={<ContentStudioPage />} />
            <Route path="/estudio/ppv" element={<ContentStudioPage />} />
            <Route path="/estudio/promocoes" element={<Phase9CreatorPromotionsPage />} />
            <Route path="/estudio/mensagens" element={<Phase7MessagesPage />} />
            <Route path="/estudio/mensagens-pagas" element={<CreatorAutoRepliesPage />} />
            <Route path="/estudio/sorteios" element={<CreatorEngagementPage />} />
            {liveRoutesEnabled ? <Route path="/estudio/chamadas" element={<CreatorLiveStudioPage />} /> : null}
            <Route path="/estudio/encontros" element={<Phase8CreatorMeetingsPage />} />
            <Route path="/estudio/seguranca" element={<CreatorSafetyControlsPage />} />
            <Route path="/estudio/check-in" element={<Phase8CreatorSafetyPage />} />
            <Route path="/estudio/panico" element={<Phase8CreatorSafetyPage />} />
            <Route path="/estudio/bloqueios" element={<CreatorSafetyControlsPage />} />
            <Route path="/estudio/silenciados" element={<CreatorSafetyControlsPage />} />
            <Route path="/estudio/nao-mostrar" element={<CreatorSafetyControlsPage />} />
            <Route path="/estudio/levantamentos" element={<Phase6CreatorEarningsPage />} />
            <Route path="/estudio/recibos" element={<Phase6CreatorEarningsPage />} />
            <Route path="/estudio/suporte" element={<SupportPage />} />
          </Route>
        </Route> : null}

        <Route path="/admin/seguranca/mfa" element={<AdminMfaPage />} />
        <Route element={<FinanceGuard />}>
          <Route path="/admin/financeiro" element={<Phase6FinanceAdminPage />} />
        </Route>

        <Route element={<AdminGuard />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/utilizadores" element={<AdminUsersPage />} />
          <Route path="/admin/kyc" element={<AdminKycPage />} />
          <Route path="/admin/media" element={<AdminMediaQueuePage />} />
          <Route path="/admin/moderacao" element={<Phase8ModerationPage />} />
          <Route path="/admin/conformidade" element={<Phase8CompliancePage />} />
          <Route path="/admin/legal-holds" element={<Phase8LegalHoldsPage />} />
          <Route path="/admin/locais-seguros" element={<Phase8SafeVenuesPage />} />
          <Route path="/admin/emergencias" element={<Phase8EmergenciesPage />} />
          {phase9RoutesEnabled ? <>
            <Route path="/admin/negocio" element={<Phase9AdminBusinessPage />} />
            <Route path="/admin/integracoes-negocio" element={<Phase9BusinessIntegrationsPage />} />
            {featureFlags.agency ? <Route path="/admin/agencia" element={<Phase9AgencyPage />} /> : null}
            <Route path="/admin/production" element={<Phase10ProductionReadinessPage />} />
          </> : null}
          <Route path="/admin/storage" element={<AdminStoragePage />} />
          <Route path="/admin/auditoria" element={<AdminAuditPage />} />
          <Route path="/admin/arquivo" element={<Phase8CompliancePage />} />
          <Route path="/admin/config" element={<Phase9AdminBusinessPage />} />
          <Route path="/admin/feature-flags" element={<FeatureFlagsAdminPage />} />
          <Route path="/admin/comissoes" element={<Phase9AdminBusinessPage />} />
          <Route path="/admin/selos" element={<Phase9AdminBusinessPage />} />
          <Route path="/admin/presentes" element={<Phase9AdminBusinessPage />} />
          <Route path="/admin/suporte" element={<SupportPage admin />} />
          <Route path="/admin/tickets" element={<SupportPage admin />} />
          <Route path="/admin/relatorios" element={<Phase8CompliancePage />} />
        </Route>

        {phase2RoutesEnabled ? <Route path="/sobre" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/ajuda" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/termos" element={<InfoPage />} /> : null}
        <Route path="/legal/termos-criadoras" element={<CreatorTermsPage />} />
        {phase2RoutesEnabled ? <Route path="/legal/privacidade" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/conteudo-proibido" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/reembolsos" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/cookies" element={<InfoPage />} /> : null}
        {phase2RoutesEnabled ? <Route path="/legal/dmca" element={<Phase8DmcaPage />} /> : null}
        <Route path="/se-criadora" element={<BecomeCreator />} />

        <Route path="/404" element={<SurfaceStatePage />} />
        {stateSurfaceRoutes.map((path) => <Route key={path} path={path} element={<SurfaceStatePage />} />)}
        {import.meta.env.DEV && featureFlags.designSystem ? <Route path="/system" element={<DesignSystemPage />} /> : null}
        <Route path="*" element={<FeatureRouteResolver />} />
      </Routes>
    </main>
  </BrowserRouter></SessionProvider>;
}
