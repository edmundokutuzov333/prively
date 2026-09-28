import { zodResolver } from '@hookform/resolvers/zod';
import { EnvelopeSimple, LockKey, UserCirclePlus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { Escudo } from '@/design/Escudo';
import { requireSupabase } from '@/lib/supabase';

type Mode = 'signIn' | 'signUp';
type AuthPageProps = { mode: Mode };
type Values = { email: string; password: string; handle?: string };

export function AuthPage({ mode }: AuthPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    handle: z.string().optional()
  }).superRefine((values, ctx) => {
    if (mode === 'signUp' && !values.handle?.match(/^[a-z0-9_]{3,24}$/)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['handle'], message: 'invalid_handle' });
    }
  });
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError(null);
    setMessage(null);
    try {
      const sb = requireSupabase();
      if (mode === 'signIn') {
        const { error: signInError } = await sb.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(),
          password: values.password
        });
        if (signInError) {
          if (signInError.status === 400 || signInError.status === 401) {
            setError(t('auth.invalidCredentials'));
          } else if (signInError.message.toLowerCase().includes('email not confirmed')) {
            setError(t('auth.invalidCredentials'));
          } else {
            setError(signInError.message);
          }
          return;
        }
        navigate('/');
        return;
      }
      const { error: signUpError } = await sb.auth.signUp({ email: values.email, password: values.password, options: { data: { handle: values.handle } } });
      if (signUpError) { setError(t('auth.genericError')); return; }
      setMessage(t('auth.registered'));
    } catch {
      setError(t('auth.genericError'));
    }
  };

  const title = mode === 'signIn' ? t('auth.signInTitle') : t('auth.signUpTitle');
  const submit = mode === 'signIn' ? t('auth.signIn') : t('auth.signUp');

  return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-5 py-12 md:px-8">
    <Ficha variant="focus" className="w-full p-7 md:p-10">
      <div className="mb-8"><p className="mb-2 text-sm text-bone-500">{t('brand.tagline')}</p><h1 className="font-display text-5xl leading-[.92] text-bone-50">{title}</h1></div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {mode === 'signUp' ? <label className="block"><span className="mb-2 block text-sm text-bone-300">{t('auth.handle')}</span><span className="flex items-center rounded-md border border-input bg-ink-850 px-3"><UserCirclePlus size={19} className="text-bone-500" /><input {...register('handle')} autoComplete="username" className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" /></span>{errors.handle ? <span className="mt-2 block text-xs text-danger">{t('auth.genericError')}</span> : null}</label> : null}
        <label className="block"><span className="mb-2 block text-sm text-bone-300">{t('auth.email')}</span><span className="flex items-center rounded-md border border-input bg-ink-850 px-3"><EnvelopeSimple size={19} className="text-bone-500" /><input {...register('email')} type="email" autoComplete="email" className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" /></span>{errors.email ? <span className="mt-2 block text-xs text-danger">{t('auth.genericError')}</span> : null}</label>
        <label className="block"><span className="mb-2 block text-sm text-bone-300">{t('auth.password')}</span><span className="flex items-center rounded-md border border-input bg-ink-850 px-3"><LockKey size={19} className="text-bone-500" /><input {...register('password')} type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} className="min-h-12 w-full border-0 bg-transparent px-3 text-bone-50 outline-none" /></span>{errors.password ? <span className="mt-2 block text-xs text-danger">{t('auth.genericError')}</span> : null}</label>
        {error ? <p role="alert" className="border border-danger/35 bg-danger/5 p-3 text-sm leading-6 text-bone-50">{error}</p> : null}
        {message ? <p role="status" className="border border-ok/30 bg-ok/5 p-3 text-sm leading-6 text-bone-50">{message}</p> : null}
        <Botao type="submit" loading={isSubmitting} className="w-full">{submit}</Botao>
      </form>
      <div className="mt-7"><Escudo text={t('privacy.notice')} /></div>
      <p className="mt-7 text-sm text-bone-300">{mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')} <Link to={mode === 'signIn' ? '/registo' : '/entrar'} className="text-bone-50 underline decoration-bone-50/20 underline-offset-4">{mode === 'signIn' ? t('auth.createNow') : t('auth.signInNow')}</Link></p>
    </Ficha>
  </section>;
}