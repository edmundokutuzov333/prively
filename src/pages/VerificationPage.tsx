import { useEffect, useState } from 'react';
import { FileArrowUp, ShieldCheck } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { platformErrorKey } from '@/lib/errors';

const maxSize=10*1024*1024;

export function VerificationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [kycStatus,setKycStatus]=useState<string | null>(null);
  const [document,setDocument]=useState<File | null>(null);
  const [selfie,setSelfie]=useState<File | null>(null);
  const [loading,setLoading]=useState(false);
  const [loadingStatus,setLoadingStatus]=useState(true);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState<string | null>(null);

  useEffect(()=>{
    if(!user){setLoadingStatus(false);return;}
    let active=true;
    void requireSupabase().rpc('get_kyc_status').then(({data,error:rpcError})=>{
      if(!active)return;
      if(rpcError)setError(platformErrorKey(rpcError));
      else setKycStatus((data as string | null) ?? null);
      setLoadingStatus(false);
    });
    return ()=>{active=false;};
  },[user]);

  const upload=async()=>{
    if(!user || !document || !selfie)return;
    if(document.size>maxSize || selfie.size>maxSize){setError(t('verification.fileTooLarge'));return;}
    setError(null);setSuccess(false);setLoading(true);
    const sb=requireSupabase();
    const docPath=user.id+'/'+crypto.randomUUID()+'-document.'+(document.name.split('.').pop()?.toLowerCase()||'bin');
    const selfiePath=user.id+'/'+crypto.randomUUID()+'-selfie.'+(selfie.name.split('.').pop()?.toLowerCase()||'jpg');
    const docUpload=await sb.storage.from('prively-kyc').upload(docPath,document,{upsert:false,contentType:document.type});
    if(docUpload.error){setLoading(false);setError(docUpload.error.message);return;}
    const selfieUpload=await sb.storage.from('prively-kyc').upload(selfiePath,selfie,{upsert:false,contentType:selfie.type});
    if(selfieUpload.error){setLoading(false);setError(selfieUpload.error.message);return;}
    const submitted=await sb.functions.invoke('kyc-submit',{
      body:{docPath,selfiePath,docType:'identity_document'}
    });
    setLoading(false);
    if(submitted.error){
      setError(platformErrorKey(submitted.error));
      return;
    }
    setKycStatus('pending');
    setDocument(null);setSelfie(null);
    setSuccess(true);
  };

  if(loadingStatus){
    return <section className="mx-auto max-w-4xl space-y-8" aria-busy="true">
      <div className="space-y-3"><div className="h-4 w-28 animate-pulse rounded bg-ink-850"/><div className="h-14 w-2/3 animate-pulse rounded bg-ink-850"/><div className="h-5 w-full max-w-2xl animate-pulse rounded bg-ink-850"/></div>
      <Ficha variant="focus" className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-2"><div className="h-44 animate-pulse rounded-md bg-ink-850"/><div className="h-44 animate-pulse rounded-md bg-ink-850"/></div></Ficha>
    </section>;
  }

  if(kycStatus==='approved'){
    return <section className="mx-auto max-w-4xl space-y-8">
      <div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={19} weight="duotone"/>{t('verification.eyebrow')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('verification.title')}</h1></div>
      <Ficha variant="focus" className="p-6 md:p-8"><p className="text-base text-bone-200">{t('verification.approvedBody')}</p></Ficha>
    </section>;
  }

  return <section className="mx-auto max-w-4xl space-y-8">
    <div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={19} weight="duotone"/>{t('verification.eyebrow')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('verification.title')}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-bone-300">{t('verification.body')}</p></div>
    <Ficha variant="focus" className="p-6 md:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center"><FileArrowUp size={28} className="text-crimson-400"/><span className="mt-3 text-sm font-semibold text-bone-50">{t('verification.document')}</span><span className="mt-1 text-xs text-bone-500">{document?.name ?? t('verification.chooseFile')}</span><input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e)=>setDocument(e.target.files?.[0] ?? null)}/></label>
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center"><FileArrowUp size={28} className="text-crimson-400"/><span className="mt-3 text-sm font-semibold text-bone-50">{t('verification.selfie')}</span><span className="mt-1 text-xs text-bone-500">{selfie?.name ?? t('verification.chooseFile')}</span><input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={(e)=>setSelfie(e.target.files?.[0] ?? null)}/></label>
      </div>
      {kycStatus ? <p className="mt-6 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-300">{t('verification.status')}: <strong className="text-bone-50">{t('verification.states.'+kycStatus)}</strong></p> : null}
      {error ? <p role="alert" className="mt-6 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(platformErrorKey(error))}</p> : null}
      {success ? <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/5 p-4 text-sm text-bone-50">{t('verification.submitSuccess')}</p> : null}
      <div className="mt-6 flex justify-end"><Botao onClick={()=>void upload()} loading={loading} disabled={!document||!selfie}><ShieldCheck size={18}/>{t('verification.submit')}</Botao></div>
    </Ficha>
  </section>;
}
