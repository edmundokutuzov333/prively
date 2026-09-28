import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';

export function ExperienceGuard() {
  const { t } = useTranslation();
  const location = useLocation();
  const { loading, user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [accountState, setAccountState] = useState<string | null>(null);
  const [selfExcludedUntil, setSelfExcludedUntil] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        if (active) {
          setRoles([]);
          setAccountState(null);
          setSelfExcludedUntil(null);
          setChecking(false);
        }
        return;
      }
      const sb = requireSupabase();
      const [rolesResult, securityResult] = await Promise.all([
        sb.from('user_roles').select('role').eq('user_id', user.id),
        sb.rpc('get_security_overview')
      ]);
      if (!active) return;
      setRoles((rolesResult.data ?? []).map((item) => item.role));
      if (!securityResult.error && securityResult.data) {
        const state = securityResult.data as { account_status?: string; self_excluded_until?: string | null };
        setAccountState(state.account_status ?? null);
        setSelfExcludedUntil(state.self_excluded_until ?? null);
      }
      setChecking(false);
    };
    void load();
    return () => { active = false; };
  }, [user]);

  if (loading || checking) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-bone-500">{t('common.loading')}</div>;
  }

  if (!user) {
    const creatorEntry = location.pathname.startsWith('/estudio');
    return <Navigate to={creatorEntry ? '/se-criadora' : ('/entrar?next=' + encodeURIComponent(location.pathname))} replace />;
  }

  if (roles.includes('admin')) return <Navigate to="/admin" replace />;
  if (accountState === 'banned') return <Navigate to="/estado/banida" replace />;
  if (accountState === 'suspended') return <Navigate to="/estado/suspensa" replace />;
  if (selfExcludedUntil && new Date(selfExcludedUntil).getTime() > Date.now()) return <Navigate to="/estado/auto-exclusao" replace />;

  if (location.pathname.startsWith('/estudio') && !roles.includes('creator')) {
    return <Navigate to="/estado/acesso-negado" replace />;
  }

  return <Outlet />;
}
