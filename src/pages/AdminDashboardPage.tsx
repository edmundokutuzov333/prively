import { Link } from 'react-router-dom';
import { ShieldCheck } from '@phosphor-icons/react';
import { Ficha } from '@/design/Ficha';

const adminAreas = [
  ['utilizadores', '/admin/utilizadores'],
  ['kyc', '/admin/kyc'],
  ['moderacao', '/admin/moderacao'],
  ['financeiro', '/admin/financeiro'],
  ['conformidade', '/admin/conformidade'],
  ['auditoria', '/admin/auditoria'],
  ['arquivo', '/admin/arquivo'],
  ['legal-holds', '/admin/legal-holds'],
  ['config', '/admin/config'],
  ['feature-flags', '/admin/feature-flags'],
  ['comissoes', '/admin/comissoes'],
  ['selos', '/admin/selos'],
  ['presentes', '/admin/presentes'],
  ['locais-seguros', '/admin/locais-seguros'],
  ['suporte', '/admin/suporte'],
  ['tickets', '/admin/tickets'],
  ['emergencias', '/admin/emergencias'],
  ['relatorios', '/admin/relatorios']
] as const;

export function AdminDashboardPage() {
  return <section className="space-y-8">
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-crimson-400/30 bg-wine-900/60 text-crimson-400">
        <ShieldCheck size={25} weight="duotone" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-bone-500">ÁREA RESTRITA</p>
        <h1 className="mt-2 font-display text-5xl text-bone-50">Prively Control Room</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-bone-300">Gestão administrativa da plataforma com autorização verificada no servidor.</p>
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {adminAreas.map(([label, path]) => (
        <Link key={path} to={path} className="no-underline">
          <Ficha className="h-full p-5 transition-transform hover:-translate-y-0.5">
            <p className="text-xs uppercase tracking-[0.16em] text-bone-500">ADMIN</p>
            <p className="mt-3 text-base font-semibold text-bone-50">{label}</p>
            <p className="mt-2 text-sm text-bone-500">Abrir área</p>
          </Ficha>
        </Link>
      ))}
    </div>
  </section>;
}
