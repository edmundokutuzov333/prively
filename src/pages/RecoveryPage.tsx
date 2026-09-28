import { useState } from 'react';
import { ArrowLeft, Key, ShieldCheck } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';

export function RecoveryPage() {
  const { t } = useTranslation();
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [step,setStep]=useState<'request'|'verify'>('request');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [done,setDone]=useState(false);

  const requestCode=async()=>{
    setError(null); setLoading(true);
    const { error: requestError } = await requireSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser:false }
    });
    setLoading(false);
    if(requestError){ setError(requestError.message); return; }
    setStep('verify');
  };

  const verifyCode=async()=>{
    setError(null); setLoading(true);
    const sb=requireSupabase();
    const verified=await sb.auth.verifyOtp({email:email.trim().toLowerCase(),token:code.trim(),type:'email'});
    if(verified.error || !verified.data.session){ setLoading(false); setError(verified.error?.message ?? t('recovery.invalidCode')); return; }
    const updated=await sb.auth.updateUser({password});
    if(updated.error){ setLoading(false); setError(updated.error.message); return; }
    await sb.auth.signOut({scope:'local'});
    setLoading(false); setDone(true);
  };

  return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-5 py-12 md:px-8">
    <Ficha variant="focus" className="w-full p-7 md:p-10">
      <Link to="/entrar" className="inline-flex items-center gap-2 text-sm text-bone-500 no-underline"><ArrowLeft size={16}/>{t('auth.back')}</Link>
      <div className="mt-8 flex items-center gap-3 text-bone-500"><ShieldCheck size={20} weight="duotone"/><span>{t('recovery.eyebrow')}</span></div>
      <h1 className="mt-4 font-display text-5xl leading-[.92] text-bone-50">{t('recovery.title')}</h1>
      <p className="mt-5 text-sm leading-6 text-bone-300">{t('recovery.body')}</p>
      {done ? <div className="mt-8 rounded-md border border-ok/30 bg-ok/5 p-4 text-sm text-bone-50">{t('recovery.done')} <Link to="/entrar" className="ml-1 underline">{t('auth.signIn')}</Link>.</div> : (
        <form className="mt-8 space-y-5" onSubmit={(event)=>{event.preventDefault();void (step==='request'?requestCode():verifyCode());}}>
          <label className="block"><span className="mb-2 block text-sm text-bone-300">{t('auth.email')}</span><input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" autoComplete="email" className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" required disabled={step==='verify'}/></label>
          {step==='verify' ? <><label className="block"><span className="mb-2 block text-sm text-bone-300">{t('recovery.code')}</span><input value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" required/></label><label className="block"><span className="mb-2 block text-sm text-bone-300">{t('auth.password')}</span><input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" required/></label></> : null}
          {error ? <p role="alert" className="border border-danger/35 bg-danger/5 p-3 text-sm text-bone-50">{error}</p> : null}
          <Botao type="submit" loading={loading} className="w-full"><Key size={18}/>{step==='request'?t('recovery.sendCode'):t('recovery.reset')}</Botao>
        </form>
      )}
    </Ficha>
  </section>;
}
