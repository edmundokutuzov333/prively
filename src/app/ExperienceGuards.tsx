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
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [creatorTermsAccepted, setCreatorTermsAccepted] = useState(false);
  const [creatorArea, setCreatorArea] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const isCreatorArea = location.pathname.startsWith('/estudio');
      if (!user) {
        if (active) {
          setCreatorArea(isCreatorArea);
          setRoles([]);
          setAccountState(null);
          setSelfExcludedUntil(null);
          setKycStatus(null);
          setCreatorTermsAccepted(false);
          setChecking(false);
        }
        return;
      }

      const sb = requireSupabase();

      if (isCreatorArea) {
        const [roleResult, ageResult, creatorTermsResult] = await Promise.all([
          sb.rpc('has_role', { _uid: user.id, _role: 'creator' }),
          sb.rpc('is_age_verified', { _uid: user.id }),
          sb.rpc('get_creator_terms_status'),
        ]);

        if (!active) return;

        setCreatorArea(true);
        setRoles(roleResult.error ? [] : roleResult.data ? ['creator'] : []);
        setKycStatus(ageResult.error ? null : ageResult.data ? 'approved' : null);
        const creatorTermsStatus = Array.isArray(creatorTermsResult.data) ? creatorTermsResult.data[0] : null;
        setCreatorTermsAccepted(Boolean(!creatorTermsResult.error && creatorTermsStatus?.accepted));
        setAccountState(null);
        setSelfExcludedUntil(null);
        setChecking(false);
        return;
      }

      const [rolesResult, securityResult] = await Promise.all([
        sb.from('user_roles').select('role').eq('user_id', user.id),
        sb.rpc('get_security_overview'),
      ]);

      if (!active) return;

      setCreatorArea(false);
      setRoles((rolesResult.data ?? []).map((item) => item.role));
      if (!securityResult.error && securityResult.data) {
        const state = securityResult.data as {
          account_status?: string;
          self_excluded_until?: string | null;
          kyc_status?: string | null;
        };
        setAccountState(state.account_status ?? null);
        setSelfExcludedUntil(state.self_excluded_until ?? null);
        setKycStatus(state.kyc_status ?? null);
      }
      setCreatorTermsAccepted(false);
      setChecking(false);
    };

    setChecking(true);
    void load();
    return () => { active = false; };
  }, [location.pathname, user]);

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

  if (creatorArea) {
    if (!roles.includes('creator')) return <Navigate to="/estado/acesso-negado" replace />;
    if (kycStatus !== 'approved') return <Navigate to="/verificacao" replace />;
    if (!creatorTermsAccepted) {
      return <Navigate to={'/legal/termos-criadoras?returnTo=' + encodeURIComponent(location.pathname)} replace />;
    }
    return <Outlet />;
  }

  const kycExempt = ['/verificacao', '/boas-vindas', '/definicoes/conta', '/definicoes/seguranca'].some((path) => location.pathname === path || location.pathname.startsWith(path + '/'));
  if (!kycExempt && kycStatus !== 'approved') return <Navigate to="/verificacao" replace />;

  return <Outlet />;
}
