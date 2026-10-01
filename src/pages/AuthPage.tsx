import { zodResolver } from '@hookform/resolvers/zod';
import { EnvelopeSimple, LockKey, UserCirclePlus, ShieldCheck } from '@phosphor-icons/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { Escudo } from '@/design/Escudo';
import { requireSupabase } from '@/lib/supabase';
import { syncServerAuthSession } from '@/app/session';
import { CREATOR_TERMS_VERSION, creatorTermDeclarations, type CreatorTermDeclarationKey } from '@/content/creatorTerms';

type Mode = 'signIn' | 'signUp';
type Portal = 'client' | 'creator' | 'admin';
type AuthPageProps = { mode: Mode; portal?: Portal };
type Values = { email: string; password: string; handle?: string; ageConfirmed?: boolean; termsAccepted?: boolean; privacyAccepted?: boolean } & Partial<Record<CreatorTermDeclarationKey, boolean>>;

async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('auth_request_timeout')), ms);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

export function AuthPage({ mode, portal = 'client' }: AuthPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPortal = searchParams.get('portal');
  const effectivePortal: Portal = requestedPortal === 'creator' ? 'creator' : portal;
  const role = searchParams.get('role') === 'creator' ? 'creator' : effectivePortal;
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const isCreatorSignup = mode === 'signUp' && role === 'creator';

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(10),
    handle: z.string().optional(),
    ageConfirmed: z.boolean().optional(),
    termsAccepted: z.boolean().optional(),
    privacyAccepted: z.boolean().optional(),
    age_18: z.boolean().optional(),
    accept_terms: z.boolean().optional(),
    commission_rates: z.boolean().optional(),
    identity_verification: z.boolean().optional(),
    all_involved_adults_consent: z.boolean().optional(),
    encounters_not_prively: z.boolean().optional(),
    prohibited_content: z.boolean().optional(),
    content_rights: z.boolean().optional(),
    privacy_sensitive_data: z.boolean().optional(),
    pending_balance_retention: z.boolean().optional(),
    no_illegal_use: z.boolean().optional(),
    no_income_guarantee: z.boolean().optional(),
    essential_communications: z.boolean().optional(),
    truthful_information: z.boolean().optional(),
    suspension_termination: z.boolean().optional(),
    mozambique_law_maputo_forum: z.boolean().optional()
  }).superRefine((values, ctx) => {
    if (mode === 'signUp' && !values.handle?.match(/^[a-z0-9_.]{3,24}$/)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['handle'], message: 'invalid_handle' });
    }
    if (mode === 'signUp' && !isCreatorSignup && !values.ageConfirmed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ageConfirmed'], message: 'age_required' });
    if (mode === 'signUp' && !isCreatorSignup) {
      if (!values.termsAccepted) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['termsAccepted'], message: 'terms_required' });
      if (!values.privacyAccepted) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privacyAccepted'], message: 'privacy_required' });
    }
    if (isCreatorSignup && !values.ageConfirmed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ageConfirmed'], message: 'age_required' });
    if (isCreatorSignup) {
      for (const declaration of creatorTermDeclarations) {
        if (!values[declaration.key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [declaration.key], message: 'creator_terms_required' });
        }
      }
    }
  });

  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<Values>({
    resolver: zodResolver(schema)
  });

  const describeAuthError = (authError: { code?: string; message?: string } | null | undefined) => {
    const code = authError?.code ?? '';
    const raw = (authError?.message ?? '').toLowerCase();

    if (code === 'email_not_confirmed' || raw.includes('email not confirmed') || raw.includes('email não confirmado')) {
      return t('auth.confirmEmailRequired');
    }
    if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
      return t('auth.invalidCredentials');
    }
    if (code === 'user_already_exists' || raw.includes('already registered') || raw.includes('already been registered')) {
      return t('auth.accountAlreadyExists');
    }
    if (code === 'weak_password' || raw.includes('password') && raw.includes('weak')) {
      return t('auth.passwordTooWeak');
    }
    return authError?.message ?? t('auth.genericError');
  };

  const onSubmit = async (values: Values) => {
    setError(null);
    setMessage(null);
    setConfirmationEmail(null);

    try {
      const sb = requireSupabase();
      const email = values.email.trim().toLowerCase();

      if (mode === 'signIn') {
        const { data, error: signInError } = await withTimeout(sb.auth.signInWithPassword({
          email,
          password: values.password
        }));

        if (signInError || !data.user || !data.session) {
          setError(describeAuthError(signInError));
          if (signInError?.code === 'email_not_confirmed') {
            setConfirmationEmail(email);
          }
          return;
        }

        // The Supabase session is the authentication result. Portal authorization is enforced
        // by AdminGuard / ExperienceGuard after navigation, so secondary RPCs cannot block login.
        void syncServerAuthSession(data.session);
        navigate(effectivePortal === 'admin' ? '/admin' : effectivePortal === 'creator' ? '/estudio' : '/descobrir', { replace: true });
        return;
      }

      const signupRole = role === 'creator' ? 'creator' : 'client';
      const { data, error: signUpError } = await withTimeout(sb.auth.signUp({
        email,
        password: values.password,
        options: {
          data: {
            handle: values.handle,
            display_name: values.handle,
            signup_role: signupRole,
            role: signupRole,
            age_confirmed: Boolean(values.ageConfirmed),
            legal_acceptances: {
              terms: { version: '1.0' },
              privacy: { version: '1.0' },
              creator_terms: isCreatorSignup ? { version: CREATOR_TERMS_VERSION, declarations: Object.fromEntries(creatorTermDeclarations.map(({ key }) => [key, true])) } : undefined,
            }
          }
        }
      }));

      if (signUpError) {
        setError(describeAuthError(signUpError));
        return;
      }

      if (!data.user) {
        setError(t('auth.genericError'));
        return;
      }

      if (!data.session) {
        setConfirmationEmail(email);
        setMessage(t('auth.confirmEmailRequired'));
        return;
      }

      const consent = await sb.rpc('record_consent', { _consent_type: 'age_gate', _version: '1.0' });
      const legalResult = isCreatorSignup
        ? await sb.rpc('accept_creator_terms', {
            _version: CREATOR_TERMS_VERSION,
            _declarations: Object.fromEntries(creatorTermDeclarations.map(({ key }) => [key, true])),
            _source: 'registration',
            _metadata: { route: window.location.pathname, acceptance_flow: 'creator_registration' },
          })
        : null;
      const terms = isCreatorSignup ? null : await sb.rpc('record_legal_acceptance', { _document_type: 'terms', _version: '1.0' });
      const privacy = isCreatorSignup ? null : await sb.rpc('record_legal_acceptance', { _document_type: 'privacy', _version: '1.0' });
      if (consent.error || legalResult?.error || terms?.error || privacy?.error) {
        await sb.auth.signOut({ scope: 'local' });
        setError(consent.error?.message ?? legalResult?.error?.message ?? terms?.error?.message ?? privacy?.error?.message ?? t('auth.legalAcceptanceError'));
        return;
      }

      void syncServerAuthSession(data.session);
      setMessage(t(signupRole === 'creator' ? 'auth.creatorRegistered' : 'auth.clientRegistered'));
      navigate(signupRole === 'creator' ? '/verificacao' : '/descobrir', { replace: true });
    } catch (submissionError) {
      const message = submissionError instanceof Error && submissionError.message === 'auth_request_timeout'
        ? t('auth.authServiceTimeout')
        : submissionError instanceof Error
          ? submissionError.message
          : t('auth.genericError');
      setError(message);
    }
  };

  const resendConfirmation = async () => {
    if (!confirmationEmail || resendingConfirmation) return;
    setError(null);
    setMessage(null);
    setResendingConfirmation(true);
    try {
      const { error: resendError } = await requireSupabase().auth.resend({
        type: 'signup',
        email: confirmationEmail,
      });
      if (resendError) {
        setError(describeAuthError(resendError));
        return;
      }
      setMessage(t('auth.confirmEmailResent'));
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : t('auth.genericError'));
    } finally {
      setResendingConfirmation(false);
    }
  };

  const title = mode === 'signIn'
    ? effectivePortal === 'admin'
      ? t('auth.adminTitle')
      : effectivePortal === 'creator'
        ? t('auth.creatorSignInTitle')
        : t('auth.signInTitle')
    : effectivePortal === 'creator' || role === 'creator'
      ? t('auth.creatorSignUpTitle')
      : t('auth.signUpTitle');

  const creatorAgeConfirmed = Boolean(watch('ageConfirmed'));
  const creatorDeclarationsChecked = creatorTermDeclarations.every(({ key }) => Boolean(watch(key)));
  const creatorSignupReady = creatorAgeConfirmed && creatorDeclarationsChecked;
  const submit = mode === 'signIn' ? t('auth.signIn') : isCreatorSignup ? 'Concordo e quero criar conta' : t('auth.signUp');

  return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-5 py-12 md:px-8">
    <Ficha variant="focus" className="w-full p-6 sm:p-7 md:p-10">
      <div className="mb-8">
        <p className="mb-2 flex items-center gap-2 text-sm text-bone-500">
          {effectivePortal === 'admin' ? <ShieldCheck size={17} weight="duotone" /> : null}
          {effectivePortal === 'admin' ? t('auth.adminEyebrow') : t('brand.tagline')}
        </p>
        <h1 className="font-display text-5xl leading-[.92] text-bone-50">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate aria-busy={isSubmitting}>
        {mode === 'signUp' ? <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.handle')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <UserCirclePlus size={19} className="text-bone-500" />
            <input {...register('handle')} id="auth-handle" autoComplete="username" aria-invalid={Boolean(errors.handle)} className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.handle ? <span className="mt-2 block text-xs text-danger">{t('auth.invalidHandle')}</span> : null}
        </label> : null}

        <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.email')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <EnvelopeSimple size={19} className="text-bone-500" />
            <input {...register('email')} id="auth-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'auth-email-error' : undefined} className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.email ? <span id="auth-email-error" className="mt-2 block text-xs text-danger">{t('auth.invalidEmail')}</span> : null}
        </label>

        {mode === 'signUp' ? <div className="space-y-3 rounded-md border border-bone-50/8 bg-ink-850 p-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('ageConfirmed')} className="mt-1 accent-crimson-500"/><span>{t('auth.ageConfirmed')}</span></label>
          {isCreatorSignup ? <>
            <p className="text-xs leading-5 text-bone-500">Termos e Condições para Criadoras · versão {CREATOR_TERMS_VERSION}. Leia o documento completo em <Link to="/legal/termos-criadoras" className="text-bone-50 underline underline-offset-4">/legal/termos-criadoras</Link>.</p>
            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {creatorTermDeclarations.map((declaration, index) => <label key={declaration.key} className="flex items-start gap-3 rounded-md border border-bone-50/8 bg-ink-900 p-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register(declaration.key)} className="mt-1 accent-crimson-500"/><span><strong className="mr-1 text-bone-500">{index + 1}.</strong>{declaration.text}</span></label>)}
            </div>
            {errors.ageConfirmed || creatorTermDeclarations.some(({ key }) => Boolean(errors[key])) ? <p className="text-xs text-danger">A confirmação de maioridade e as 16 declarações obrigatórias são necessárias para continuar.</p> : null}
          </> : <>
            <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('termsAccepted')} className="mt-1 accent-crimson-500"/><span>{t('auth.termsAccepted')}</span></label>
            <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('privacyAccepted')} className="mt-1 accent-crimson-500"/><span>{t('auth.privacyAccepted')}</span></label>
            {errors.ageConfirmed || errors.termsAccepted || errors.privacyAccepted ? <p className="text-xs text-danger">{t('auth.acceptanceRequired')}</p> : null}
          </>}
        </div> : null}

        <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.password')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <LockKey size={19} className="text-bone-500" />
            <input {...register('password')} id="auth-password" type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'auth-password-error' : undefined} className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.password ? <span id="auth-password-error" className="mt-2 block text-xs text-danger">{t('auth.passwordRequirement')}</span> : null}
        </label>

        {error ? <p role="alert" aria-live="assertive" className="border border-danger/35 bg-danger/5 p-3 text-sm leading-6 text-bone-50">{error}</p> : null}
        {message ? <div role="status" aria-live="polite" className="border border-ok/30 bg-ok/5 p-4 text-sm leading-6 text-bone-50">
          <p>{message}</p>
          {confirmationEmail ? (
            <button type="button" onClick={() => void resendConfirmation()} disabled={resendingConfirmation} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[2px] border border-bone-50/15 bg-transparent px-3 text-sm font-semibold text-bone-50 hover:border-crimson-500/40 hover:bg-wine-900/30 disabled:cursor-not-allowed disabled:opacity-60">
              {resendingConfirmation ? t('common.loading') : t('auth.resendConfirmation')}
            </button>
          ) : null}
        </div> : null}
        <Botao type="submit" loading={isSubmitting} disabled={isCreatorSignup && !creatorSignupReady} className="w-full min-h-12">
          {isSubmitting ? (mode === 'signIn' ? t('auth.signingIn') : t('auth.creatingAccount')) : submit}
        </Botao>
        {mode === 'signIn' && effectivePortal !== 'admin' ? <Link to="/recuperar" className="block text-center text-sm text-bone-500 underline decoration-bone-50/20 underline-offset-4">{t('auth.recoverAccount')}</Link> : null}
      </form>

      <div className="mt-7"><Escudo text={t('privacy.notice')} /></div>
      <p className="mt-7 text-center text-sm leading-6 text-bone-300 sm:text-left">
        {mode === 'signIn'
          ? <>{t('auth.noAccount')} <Link to={effectivePortal === 'creator' ? '/idade?role=creator' : effectivePortal === 'admin' ? '/admin' : '/registo'} className="text-bone-50 underline decoration-bone-50/20 underline-offset-4">{t('auth.createNow')}</Link></>
          : <>{t('auth.haveAccount')} <Link to={effectivePortal === 'creator' ? '/se-criadora' : '/entrar'} className="text-bone-50 underline decoration-bone-50/20 underline-offset-4">{t('auth.signInNow')}</Link></>
        }
      </p>
    </Ficha>
  </section>;
}
