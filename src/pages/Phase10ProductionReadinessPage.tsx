import { useEffect, useState } from 'react';
import { ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';
import { phase9Rpc } from '@/lib/phase9Api';

type Check = { ok: boolean; severity: string };
type Readiness = { launchable: boolean; generated_at: string; checks: Record<string, Check> };

const labels: Record<string, string> = {
  database_rls: 'RLS em todas as tabelas',
  storage_private: 'Storage privado',
  ledger_reconciliation: 'Reconciliação financeira',
  critical_cron: 'Jobs críticos activos',
  security_contracts: 'Contratos de segurança',
  external_security_tested: 'Teste externo de segurança',
  legal_reviewed: 'Revisão jurídica',
  terms_published: 'Termos publicados',
  privacy_published: 'Política de privacidade publicada',
  kyc_provider_verified: 'Provider KYC validado',
  moderation_team_verified: 'Equipa de moderação validada',
  backups_validated: 'Backups validados',
  recovery_drill_validated: 'Recovery drill validado',
  payment_provider_verified: 'Provider de pagamentos validado',
  launch_enabled: 'Launch gate',
};

export function Phase10ProductionReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setData(await phase9Rpc<Readiness>('get_production_readiness'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o production readiness gate.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <PageFrame
      icon={ShieldCheck}
      eyebrow="Control Room · Production"
      title="Production readiness"
      intro="Este painel não aprova o lançamento por aparência. Mostra apenas checks reais do backend e separa blockers internos de validações externas."
    >
      {error ? <p role="alert" className="mb-5 text-sm text-danger">{error}</p> : null}
      {!data ? <LoadingState /> : (
        <>
          <Ficha variant={data.launchable ? 'focus' : 'flat'}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs tracking-[0.16em] text-bone-500">Estado</p>
                <h2 className="mt-2 font-display text-4xl text-bone-50">
                  {data.launchable ? 'Apto pelo gate' : 'Bloqueado pelo gate'}
                </h2>
                <p className="mt-2 text-sm text-bone-400">
                  Gerado em {new Date(data.generated_at).toLocaleString('pt-MZ')}
                </p>
              </div>
              <div className={data.launchable ? 'text-ok' : 'text-warn'}>
                {data.launchable ? <ShieldCheck size={40} weight="duotone" /> : <WarningCircle size={40} weight="duotone" />}
              </div>
            </div>
          </Ficha>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {Object.entries(data.checks).map(([key, check]) => (
              <Ficha key={key}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-bone-50">{labels[key] ?? key}</p>
                    <p className="mt-1 text-xs text-bone-500">{check.severity}</p>
                  </div>
                  <span className={check.ok ? 'text-ok' : 'text-danger'}>{check.ok ? 'OK' : 'BLOCK'}</span>
                </div>
              </Ficha>
            ))}
          </div>

          {!data.launchable ? (
            <div className="mt-6">
              <EstadoVazio
                title="O lançamento continua protegido"
                body="Valida os blockers externos e só depois liga production.launch_enabled. O sistema não altera esse gate sozinho."
              />
            </div>
          ) : (
            <Botao className="mt-6" type="button" onClick={() => void load()}>Revalidar</Botao>
          )}
        </>
      )}
    </PageFrame>
  );
}

function LoadingState() {
  return <Ficha><p className="text-sm text-bone-400">A validar o estado real do sistema...</p></Ficha>;
}
