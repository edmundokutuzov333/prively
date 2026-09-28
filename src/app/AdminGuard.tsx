import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

export function AdminGuard() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!user) {
        if (active) setChecking(false);
        return;
      }

      const sb = requireSupabase();
      const { data, error } = await sb.from('user_roles').select('role').eq('user_id', user.id);
      if (!active) return;
      const isAdmin = !error && Boolean(data?.some((item) => item.role === 'admin'));
      if (!isAdmin) {
        setAllowed(false);
        setChecking(false);
        return;
      }

      const factors = await sb.auth.mfa.listFactors();
      if (!active) return;
      const verified = !factors.error && factors.data.totp.some((factor) => factor.status === 'verified');
      if (!verified) {
        setNeedsMfa(true);
        setAllowed(false);
        setChecking(false);
        return;
      }

      const assurance = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (!assurance.error && assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
        setNeedsMfa(true);
        setAllowed(false);
        setChecking(false);
        return;
      }

      setAllowed(true);
      setChecking(false);
    };

    void check();
    return () => { active = false; };
  }, [user]);

  if (loading || checking) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-bone-500">{t('common.loading')}</div>;
  }
  if (!user) return <Navigate to="/admin/entrar" replace state={{ from: location.pathname }} />;
  if (needsMfa) return <Navigate to="/admin/seguranca/mfa" replace state={{ from: location.pathname }} />;
  if (!allowed) return <Navigate to="/estado/acesso-negado" replace />;
  return <Outlet />;
}
