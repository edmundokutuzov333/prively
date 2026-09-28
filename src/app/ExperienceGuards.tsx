import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';

export function ExperienceGuard() {
  const { t } = useTranslation();
  const location = useLocation();
  const { loading, user, configured } = useAuth();

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-bone-500">{t('common.loading')}</div>;

  if (!user && configured && !import.meta.env.DEV) {
    return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!user && !configured && !import.meta.env.DEV) {
    return <Navigate to="/entrar" replace />;
  }

  return <Outlet />;
}