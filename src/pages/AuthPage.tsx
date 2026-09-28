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

type Mode = 'signIn' | 'signUp';
type Portal = 'client' | 'creator' | 'admin';
type AuthPageProps = { mode: Mode; portal?: Portal };
type Values = { email: string; password: string; handle?: string; ageConfirmed?: boolean; termsAccepted?: boolean; privacyAccepted?: boolean };

export function AuthPage({ mode, portal = 'client' }: AuthPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPortal = searchParams.get('portal');
  const effectivePortal: Portal = requestedPortal === 'creator' ? 'creator' : portal;
  const role = searchParams.get('role') === 'creator' ? 'creator' : effectivePortal;
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    handle: z.string().optional(),
    ageConfirmed: z.boolean().optional(),
    termsAccepted: z.boolean().optional(),
    privacyAccepted: z.boolean().optional()
  }).superRefine((values, ctx) => {
    if (mode === 'signUp' && !values.handle?.match(/^[a-z0-9_]{3,24}$/)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['handle'], message: 'invalid_handle' });
    }
    if (mode === 'signUp' && !values.ageConfirmed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ageConfirmed'], message: 'age_required' });
    if (mode === 'signUp' && !values.termsAccepted) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['termsAccepted'], message: 'terms_required' });
    if (mode === 'signUp' && !values.privacyAccepted) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privacyAccepted'], message: 'privacy_required' });
  });

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<Values>({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (values: Values) => {
    setError(null);
    setMessage(null);

    try {
      const sb = requireSupabase();

      if (mode === 'signIn') {
        const { data, error: signInError } = await sb.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(),
          password: values.password
        });

        if (signInError || !data.user) {
          setError(signInError?.message ?? t('auth.invalidCredentials'));
          return;
        }

        const { data: roles, error: rolesError } = await sb
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id);

        if (rolesError) {
          await sb.auth.signOut();
          setError(rolesError.message);
          return;
        }

        const roleSet = new Set((roles ?? []).map((item) => item.role));

        if (effectivePortal === 'admin' && !roleSet.has('admin')) {
          await sb.auth.signOut();
          setError(t('auth.adminRequired'));
          return;
        }

        if (effectivePortal === 'client' && roleSet.has('admin')) {
          await sb.auth.signOut();
          setError(t('auth.adminUsePortal'));
          return;
        }

        if (effectivePortal === 'creator' && !roleSet.has('creator')) {
          await sb.auth.signOut();
          setError(t('auth.creatorRequired'));
          return;
        }

        navigate(effectivePortal === 'admin' ? '/admin' : effectivePortal === 'creator' ? '/estudio' : '/descobrir', { replace: true });
        return;
      }

      const signupRole = role === 'creator' ? 'creator' : 'client';
      const { data, error: signUpError } = await sb.auth.signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          data: {
            handle: values.handle,
            display_name: values.handle,
            signup_role: signupRole
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session) {
        const { data: signedIn, error: signInAfterSignupError } = await sb.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(),
          password: values.password
        });

        if (signInAfterSignupError || !signedIn.session) {
          setError(signInAfterSignupError?.message ?? t('auth.registrationNoSession'));
          return;
        }
      }

      const consent = await sb.rpc('record_consent', { _consent_type: 'age_gate', _version: '1.0' });
      const terms = await sb.rpc('record_legal_acceptance', { _document_type: 'terms', _version: '1.0' });
      const privacy = await sb.rpc('record_legal_acceptance', { _document_type: 'privacy', _version: '1.0' });
      if (consent.error || terms.error || privacy.error) {
        await sb.auth.signOut({ scope: 'local' });
        setError(consent.error?.message ?? terms.error?.message ?? privacy.error?.message ?? t('auth.legalAcceptanceError'));
        return;
      }

      setMessage(t(signupRole === 'creator' ? 'auth.creatorRegistered' : 'auth.clientRegistered'));
      navigate(signupRole === 'creator' ? '/estudio' : '/descobrir', { replace: true });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t('auth.genericError'));
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

  const submit = mode === 'signIn' ? t('auth.signIn') : t('auth.signUp');

  return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-5 py-12 md:px-8">
    <Ficha variant="focus" className="w-full p-7 md:p-10">
      <div className="mb-8">
        <p className="mb-2 flex items-center gap-2 text-sm text-bone-500">
          {effectivePortal === 'admin' ? <ShieldCheck size={17} weight="duotone" /> : null}
          {effectivePortal === 'admin' ? t('auth.adminEyebrow') : t('brand.tagline')}
        </p>
        <h1 className="font-display text-5xl leading-[.92] text-bone-50">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {mode === 'signUp' ? <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.handle')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <UserCirclePlus size={19} className="text-bone-500" />
            <input {...register('handle')} autoComplete="username" className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.handle ? <span className="mt-2 block text-xs text-danger">{t('auth.invalidHandle')}</span> : null}
        </label> : null}

        <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.email')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <EnvelopeSimple size={19} className="text-bone-500" />
            <input {...register('email')} type="email" autoComplete="email" className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.email ? <span className="mt-2 block text-xs text-danger">{t('auth.invalidCredentials')}</span> : null}
        </label>

        {mode === 'signUp' ? <div className="space-y-3 rounded-md border border-bone-50/8 bg-ink-850 p-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('ageConfirmed')} className="mt-1 accent-crimson-500"/><span>{t('auth.ageConfirmed')}</span></label>
          <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('termsAccepted')} className="mt-1 accent-crimson-500"/><span>{t('auth.termsAccepted')}</span></label>
          <label className="flex items-start gap-3 text-sm leading-6 text-bone-300"><input type="checkbox" {...register('privacyAccepted')} className="mt-1 accent-crimson-500"/><span>{t('auth.privacyAccepted')}</span></label>
          {errors.ageConfirmed || errors.termsAccepted || errors.privacyAccepted ? <p className="text-xs text-danger">{t('auth.acceptanceRequired')}</p> : null}
        </div> : null}

        <label className="block">
          <span className="mb-2 block text-sm text-bone-300">{t('auth.password')}</span>
          <span className="flex items-center rounded-md border border-input bg-ink-850 px-3">
            <LockKey size={19} className="text-bone-500" />
            <input {...register('password')} type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" />
          </span>
          {errors.password ? <span className="mt-2 block text-xs text-danger">{t('auth.genericError')}</span> : null}
        </label>

        {error ? <p role="alert" className="border border-danger/35 bg-danger/5 p-3 text-sm leading-6 text-bone-50">{error}</p> : null}
        {message ? <p role="status" className="border border-ok/30 bg-ok/5 p-3 text-sm leading-6 text-bone-50">{message}</p> : null}
        <Botao type="submit" loading={isSubmitting} className="w-full">{submit}</Botao>
      </form>

      <div className="mt-7"><Escudo text={t('privacy.notice')} /></div>
      <p className="mt-7 text-sm text-bone-300">
        {mode === 'signIn'
          ? <>{t('auth.noAccount')} <Link to={effectivePortal === 'creator' ? '/idade?role=creator' : effectivePortal === 'admin' ? '/admin' : '/registo'} className="text-bone-50 underline decoration-bone-50/20 underline-offset-4">{t('auth.createNow')}</Link></>
          : <>{t('auth.haveAccount')} <Link to={effectivePortal === 'creator' ? '/se-criadora' : '/entrar'} className="text-bone-50 underline decoration-bone-50/20 underline-offset-4">{t('auth.signInNow')}</Link></>
        }
      </p>
    </Ficha>
  </section>;
}
