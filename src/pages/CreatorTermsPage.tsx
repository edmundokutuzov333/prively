import { FileText, ShieldCheck } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/session';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import {
  CREATOR_TERMS_VERSION,
  creatorTermDeclarations,
  creatorTermsClosingNote,
  creatorTermsSections,
  type CreatorTermDeclarationKey,
} from '@/content/creatorTerms';
import { requireSupabase } from '@/lib/supabase';

type DeclarationState = Record<CreatorTermDeclarationKey, boolean>;

const initialDeclarations = creatorTermDeclarations.reduce((acc, item) => {
  acc[item.key] = false;
  return acc;
}, {} as DeclarationState);

export function CreatorTermsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [declarations, setDeclarations] = useState<DeclarationState>(initialDeclarations);
  const [checking, setChecking] = useState(true);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const returnTo = useMemo(() => {
    const value = searchParams.get('returnTo');
    return value && value.startsWith('/') ? value : '/estudio';
  }, [searchParams]);

  const allChecked = creatorTermDeclarations.every((item) => declarations[item.key]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        if (active) setChecking(false);
        return;
      }
      const result = await requireSupabase().rpc('get_creator_terms_status');
      if (!active) return;
      if (!result.error && Array.isArray(result.data) && result.data[0]?.accepted) {
        setAcceptedAt(result.data[0].accepted_at ?? null);
      }
      setChecking(false);
    };
    void load();
    return () => { active = false; };
  }, [user]);

  const accept = async () => {
    if (!user || !allChecked) return;
    setSaving(true);
    setError(null);
    const result = await requireSupabase().rpc('accept_creator_terms', {
      _version: CREATOR_TERMS_VERSION,
      _declarations: declarations,
      _source: 'web',
      _metadata: {
        route: window.location.pathname,
        acceptance_flow: 'creator_terms_gate',
      },
    });

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setAcceptedAt(new Date().toISOString());
    setSaving(false);
    navigate(returnTo, { replace: true });
  };

  if (loading || checking) {
    return <section className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-5 py-12 md:px-8"><p className="text-sm text-bone-500">A carregar…</p></section>;
  }

  return <section className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 text-sm text-bone-500">
        <FileText size={19} weight="duotone" />
        <span>Documento jurídico para criadoras · versão {CREATOR_TERMS_VERSION}</span>
      </div>
      <h1 className="mt-4 font-display text-[clamp(3.2rem,7vw,6rem)] leading-[.88] text-bone-50">Termos e Condições para Criadoras</h1>
      <p className="mt-6 max-w-3xl text-base leading-7 text-bone-300">Leia com atenção. Para concluir o cadastro ou continuar a operar como criadora, todas as declarações obrigatórias têm de ser confirmadas.</p>
    </div>

    <div className="mt-10 space-y-5">
      {creatorTermsSections.map((section) => (
        <Ficha key={section.number} variant="flat" className="p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.18em] text-bone-500">{section.number}</p>
          <h2 className="mt-2 font-display text-3xl leading-tight text-bone-50">{section.title}</h2>
          {'intro' in section && section.intro ? <p className="mt-5 text-sm leading-6 text-bone-300">{section.intro}</p> : null}
          <div className="mt-5 space-y-4 text-sm leading-7 text-bone-300">
            {'paragraphs' in section && section.paragraphs ? section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}
            {'bullets' in section && section.bullets ? <ul className="space-y-2 pl-5">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            {'paragraphsAfter' in section && section.paragraphsAfter ? section.paragraphsAfter.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}
            {'bulletsAfter' in section && section.bulletsAfter ? <ul className="space-y-2 pl-5">{section.bulletsAfter.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            {'paragraphsAfter2' in section && section.paragraphsAfter2 ? section.paragraphsAfter2.map((paragraph) => <p key={paragraph}>{paragraph}</p>) : null}
          </div>
        </Ficha>
      ))}

      <Ficha variant="focus" className="p-6 md:p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} weight="duotone" className="mt-0.5 text-crimson-400" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-bone-500">15 · Declarações obrigatórias</p>
            <h2 className="mt-2 font-display text-3xl leading-tight text-bone-50">Todas as caixas devem ser marcadas</h2>
            <p className="mt-4 text-sm leading-6 text-bone-300">O servidor valida as 16 declarações. A aceitação é versionada e registada na base de dados para auditoria.</p>
          </div>
        </div>

        <div className="mt-7 space-y-3">
          {creatorTermDeclarations.map((item, index) => (
            <label key={item.key} className="flex items-start gap-3 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm leading-6 text-bone-300">
              <input
                type="checkbox"
                checked={declarations[item.key]}
                onChange={(event) => setDeclarations((current) => ({ ...current, [item.key]: event.target.checked }))}
                className="mt-1 accent-crimson-500"
              />
              <span><strong className="mr-1 text-bone-500">{index + 1}.</strong>{item.text}</span>
            </label>
          ))}
        </div>

        {error ? <p role="alert" className="mt-5 border border-danger/35 bg-danger/5 p-3 text-sm leading-6 text-bone-50">{error}</p> : null}
        {acceptedAt ? <p role="status" className="mt-5 border border-ok/30 bg-ok/5 p-3 text-sm leading-6 text-bone-50">Os Termos v{CREATOR_TERMS_VERSION} já estão aceites para esta conta.</p> : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          {user ? (
            <Botao type="button" onClick={() => { void accept(); }} loading={saving} disabled={!allChecked || Boolean(acceptedAt)} className="sm:min-w-72">
              Concordo e quero criar conta
            </Botao>
          ) : (
            <Link to="/registo?role=creator" className="inline-flex min-h-11 items-center justify-center rounded-[2px] border border-crimson-400/40 bg-crimson-500 px-4 py-3 text-sm font-semibold text-white no-underline">
              Criar conta de criadora
            </Link>
          )}
          <Link to="/legal/privacidade" className="text-sm text-bone-500 underline decoration-bone-50/20 underline-offset-4">Consultar Política de Privacidade</Link>
        </div>

        {acceptedAt ? <p className="mt-3 text-xs text-bone-500">Aceite registado em {new Date(acceptedAt).toLocaleString('pt-MZ')}.</p> : null}
      </Ficha>

      <Ficha variant="flat" className="mt-5 p-6 md:p-8">
        <p className="text-sm leading-7 text-bone-300"><strong className="text-bone-50">16 · Assinatura Digital.</strong> Ao clicar em “Concordo e quero criar conta”, a Criadora declara que leu, compreendeu e aceitou todos os Termos acima, e que as declarações marcadas são verdadeiras.</p>
      </Ficha>

      <div className="mt-6 border border-bone-50/8 bg-ink-900 p-5 text-xs leading-6 text-bone-500">
        Nota final: {creatorTermsClosingNote}
      </div>
    </div>
  </section>;
}
