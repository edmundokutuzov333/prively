import { ChartLineUp, ChatCircle, Compass, FilmStrip, GearSix, House, NotePencil, UserCircle, Wallet } from '@phosphor-icons/react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/session';
import { Avatar } from '@/design/Avatar';
import { DiscreetGate } from '@/app/DiscreetGate';
import { requireSupabase } from '@/lib/supabase';
import { Cordao } from '@/design/Cordao';

type WorkspaceVariant = 'client' | 'creator';

const clientNav = [
  { key: 'discover', path: '/descobrir', icon: Compass },
  { key: 'feed', path: '/feed', icon: House },
  { key: 'wallet', path: '/carteira', icon: Wallet, central: true },
  { key: 'messages', path: '/mensagens', icon: ChatCircle },
  { key: 'account', path: '/definicoes/conta', icon: UserCircle }
] as const;

const creatorNav = [
  { key: 'studio', path: '/estudio', icon: ChartLineUp },
  { key: 'content', path: '/estudio/conteudo', icon: FilmStrip },
  { key: 'create', path: '/estudio/conteudo', icon: NotePencil, central: true },
  { key: 'messages', path: '/mensagens', icon: ChatCircle },
  { key: 'settings', path: '/estudio/definicoes', icon: GearSix }
] as const;

function activePath(pathname: string, target: string) {
  return pathname === target || (target !== '/' && pathname.startsWith(`${target}/`));
}

export function WorkspaceLayout({ variant }: { variant: WorkspaceVariant }) {
  const { t } = useTranslation();
  const { user, configured } = useAuth();
  const [publicName, setPublicName] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setPublicName(null); return; }
    void requireSupabase().from('profiles').select('display_name,handle').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data) setPublicName(data.display_name || data.handle || null);
    });
  }, [user]);
  const location = useLocation();
  const nav = variant === 'client' ? clientNav : creatorNav;
  const sectionLabel = variant === 'client' ? t('experience.workspace.client') : t('experience.workspace.creator');

  return <DiscreetGate><div className="min-h-[calc(100vh-4rem)] bg-ink-950">
    <div className="mx-auto grid max-w-[1440px] md:grid-cols-[76px_1fr]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-r border-bone-50/6 md:flex md:flex-col md:items-center md:gap-3 md:px-3 md:py-5">
        <Link to="/" className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-crimson-400/30 bg-wine-900 font-display text-lg text-bone-50" aria-label={t('brand.name')}>P</Link>
        {nav.map((item) => { const { key, path, icon: Icon } = item; const central = 'central' in item && item.central; return <Link key={key} to={path} title={t(`experience.nav.${key}`)} className={`group flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${activePath(location.pathname, path) ? 'border-crimson-400/30 bg-wine-900 text-bone-50' : central ? 'border-bone-50/10 bg-ink-900 text-crimson-400 hover:border-crimson-400/30' : 'border-transparent text-bone-500 hover:bg-ink-900 hover:text-bone-50'}`}><Icon size={20} weight="duotone" /></Link>; })}
      </aside>

      <div className="min-w-0">
        <div className="border-b border-bone-50/6 bg-ink-950/75">
          <div className="flex min-h-16 items-center justify-between gap-4 px-5 md:px-8">
            <div className="min-w-0"><p className="truncate text-xs uppercase tracking-[0.18em] text-bone-500">{sectionLabel}</p><div className="mt-1 flex items-center gap-2"><Cordao /><span className="hidden text-xs text-bone-500 sm:inline">{configured ? t('experience.session.connected') : t('experience.session.unconfigured')}</span></div></div>
            <div className="flex shrink-0 items-center gap-3">{user ? <div className="hidden text-right sm:block"><p className="text-xs text-bone-500">{t('experience.session.active')}</p><p className="max-w-[220px] truncate text-sm text-bone-50">{publicName ?? 'Conta privada'}</p></div> : <p className="hidden text-xs text-bone-500 sm:block">{t('experience.session.preview')}</p>}<Avatar label={publicName ?? 'Conta privada'} compact /></div>
          </div>
        </div>

        <div className="px-5 py-6 pb-24 md:px-8 md:py-10 md:pb-10"><Outlet /></div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-bone-50/7 bg-ink-950/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5 gap-1 py-2">
            {nav.map((item) => { const { key, path, icon: Icon } = item; const central = 'central' in item && item.central; return <Link key={key} to={path} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] ${activePath(location.pathname, path) ? 'text-bone-50' : central ? 'text-crimson-400' : 'text-bone-500'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full ${central ? 'border border-crimson-400/40 bg-wine-900' : ''}`}><Icon size={central ? 19 : 20} weight="duotone" /></span>{t(`experience.nav.${key}`)}</Link>; })}
          </div>
        </nav>
      </div>
    </div>
  </div></DiscreetGate>;
}