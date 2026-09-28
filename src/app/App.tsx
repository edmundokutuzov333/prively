import { Globe, Palette, SignIn, UserPlus } from '@phosphor-icons/react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { featureFlags } from '@/config/featureFlags';
import { HomePage } from '@/pages/HomePage';
import { AgeGatePage } from '@/pages/AgeGatePage';
import { AuthPage } from '@/pages/AuthPage';
import { DesignSystemPage } from '@/pages/DesignSystemPage';
import i18n, { supportedLanguages } from '@/lib/i18n';

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
        <Link to="/registo" className="flex min-h-11 items-center gap-2 rounded-md border border-bone-50/10 px-3 text-sm text-bone-50 hover:bg-ink-900"><UserPlus size={18} weight="duotone" />{t('nav.creator')}</Link>
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
  return <BrowserRouter>
    <Header />
    <main className="min-h-[calc(100vh-4rem)]">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/idade" element={<AgeGatePage />} />
        <Route path="/entrar" element={<AuthPage mode="signIn" />} />
        <Route path="/registo" element={<AuthPage mode="signUp" />} />
        {import.meta.env.DEV && featureFlags.designSystem ? <Route path="/system" element={<DesignSystemPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </BrowserRouter>;
}