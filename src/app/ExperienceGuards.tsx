import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';

export function ExperienceGuard() {
  const { t } = useTranslation();
  const location = useLocation();
  const { loading, user } = useAuth();
  const [checkingRole, setCheckingRole] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const loadRoles = async () => {
      if (!user) {
        if (active) {
          setRoles([]);
          setCheckingRole(false);
        }
        return;
      }
      const { data } = await requireSupabase().from('user_roles').select('role').eq('user_id', user.id);
      if (!active) return;
      setRoles((data ?? []).map((item) => item.role));
      setCheckingRole(false);
    };
    void loadRoles();
    return () => { active = false; };
  }, [user]);

  if (loading || checkingRole) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-bone-500">{t('common.loading')}</div>;
  }

  if (!user) {
    const creatorEntry = location.pathname.startsWith('/estudio');
    return <Navigate to={creatorEntry ? '/se-criadora' : ('/entrar?next=' + encodeURIComponent(location.pathname))} replace />;
  }

  if (roles.includes('admin')) {
    return <Navigate to="/admin" replace />;
  }

  if (location.pathname.startsWith('/estudio') && !roles.includes('creator')) {
    return <Navigate to="/estado/acesso-negado" replace />;
  }

  return <Outlet />;
}
