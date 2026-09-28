import { Link } from 'react-router-dom';
import { ShieldCheck } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';

const adminAreas = [
  ['users', '/admin/utilizadores'],
  ['kyc', '/admin/kyc'],
  ['moderation', '/admin/moderacao'],
  ['finance', '/admin/financeiro'],
  ['compliance', '/admin/conformidade'],
  ['audit', '/admin/auditoria'],
  ['archive', '/admin/arquivo'],
  ['legalHolds', '/admin/legal-holds'],
  ['config', '/admin/config'],
  ['featureFlags', '/admin/feature-flags'],
  ['commissions', '/admin/comissoes'],
  ['badges', '/admin/selos'],
  ['gifts', '/admin/presentes'],
  ['safePlaces', '/admin/locais-seguros'],
  ['support', '/admin/suporte'],
  ['tickets', '/admin/tickets'],
  ['emergencies', '/admin/emergencias'],
  ['reports', '/admin/relatorios']
] as const;

export function AdminDashboardPage() {
  const { t } = useTranslation();
  return <section className="space-y-8">
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-crimson-400/30 bg-wine-900/60 text-crimson-400">
        <ShieldCheck size={25} weight="duotone" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-bone-500">{t('auth.adminEyebrow')}</p>
        <h1 className="mt-2 font-display text-5xl text-bone-50">{t('admin.title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-bone-300">{t('admin.description')}</p>
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {adminAreas.map(([key, path]) => (
        <Link key={path} to={path} className="no-underline">
          <Ficha className="h-full p-5 transition-transform hover:-translate-y-0.5">
            <p className="text-xs uppercase tracking-[0.16em] text-bone-500">ADMIN</p>
            <p className="mt-3 text-base font-semibold text-bone-50">{t(`admin.areas.${key}`)}</p>
            <p className="mt-2 text-sm text-bone-500">{t('admin.open')}</p>
          </Ficha>
        </Link>
      ))}
    </div>
  </section>;
}
