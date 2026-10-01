import { useEffect, useState } from 'react';
import { FileArrowUp, ShieldCheck } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { platformErrorKey } from '@/lib/errors';

const maxSize=10*1024*1024;
type KycStatusDetail={status:string|null;reason:string|null;provider:string|null;created_at:string|null;reviewed_at:string|null};
const emptyKyc:KycStatusDetail={status:null,reason:null,provider:null,created_at:null,reviewed_at:null};

export function VerificationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [kyc,setKyc]=useState<KycStatusDetail>(emptyKyc);
  const [document,setDocument]=useState<File|null>(null);
  const [selfie,setSelfie]=useState<File|null>(null);
  const [loading,setLoading]=useState(false);
  const [loadingStatus,setLoadingStatus]=useState(true);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const loadStatus=async()=>{
    if(!user){setLoadingStatus(false);return;}
    const {data,error:rpcError}=await requireSupabase().rpc('get_my_kyc_status');
    if(rpcError){setError(platformErrorKey(rpcError));setLoadingStatus(false);return;}
    setKyc((data as KycStatusDetail[]|null)?.[0]??emptyKyc);
    setLoadingStatus(false);
  };

  useEffect(()=>{void loadStatus();},[user]);

  const upload=async()=>{
    if(!user||!document||!selfie||['approved','pending','review'].includes(kyc.status??''))return;
    if(document.size>maxSize||selfie.size>maxSize){setError('verification.fileTooLarge');return;}
    setError(null);setSuccess(false);setLoading(true);
    const sb=requireSupabase();
    const ext=(name:string,fallback:string)=>name.split('.').pop()?.toLowerCase()||fallback;
    const docPath=user.id+'/'+crypto.randomUUID()+'-document.'+ext(document.name,'bin');
    const selfiePath=user.id+'/'+crypto.randomUUID()+'-selfie.'+ext(selfie.name,'jpg');
    const docUpload=await sb.storage.from('prively-kyc').upload(docPath,document,{upsert:false,contentType:document.type});
    if(docUpload.error){setLoading(false);setError(platformErrorKey(docUpload.error));return;}
    const selfieUpload=await sb.storage.from('prively-kyc').upload(selfiePath,selfie,{upsert:false,contentType:selfie.type});
    if(selfieUpload.error){setLoading(false);setError(platformErrorKey(selfieUpload.error));return;}
    const submitted=await sb.functions.invoke('kyc-submit',{body:{docPath,selfiePath,docType:'identity_document'}});
    setLoading(false);
    if(submitted.error){setError(platformErrorKey(submitted.error));return;}
    setKyc({status:'pending',reason:null,provider:'manual',created_at:new Date().toISOString(),reviewed_at:null});
    setDocument(null);setSelfie(null);setSuccess(true);
  };

  if(loadingStatus)return <section className="mx-auto max-w-4xl space-y-8" aria-busy="true"><div className="space-y-3"><div className="h-4 w-28 animate-pulse rounded bg-ink-850"/><div className="h-14 w-2/3 animate-pulse rounded bg-ink-850"/><div className="h-5 w-full max-w-2xl animate-pulse rounded bg-ink-850"/></div><Ficha variant="focus" className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-2"><div className="h-44 animate-pulse rounded bg-ink-850"/><div className="h-44 animate-pulse rounded bg-ink-850"/></div></Ficha></section>;

  if(kyc.status==='approved')return <section className="mx-auto max-w-4xl space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={19} weight="duotone"/>{t('verification.eyebrow')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('verification.title')}</h1></div><Ficha variant="focus" className="p-6 md:p-8"><p className="text-base text-bone-200">{t('verification.approvedBody')}</p></Ficha></section>;

  if(kyc.status==='pending'||kyc.status==='review')return <section className="mx-auto max-w-4xl space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={19} weight="duotone"/>{t('verification.eyebrow')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('verification.title')}</h1></div><Ficha variant="focus" className="p-6 md:p-8"><p className="text-base text-bone-200">{kyc.status==='review'?t('verification.reviewBody'):t('verification.pendingBody')}</p><p className="mt-5 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-300">{t('verification.status')}: <strong className="text-bone-50">{t('verification.states.'+kyc.status)}</strong></p></Ficha></section>;

  return <section className="mx-auto max-w-4xl space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={19} weight="duotone"/>{t('verification.eyebrow')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('verification.title')}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-bone-300">{t('verification.body')}</p></div><Ficha variant="focus" className="p-6 md:p-8"><div className="grid gap-5 md:grid-cols-2"><label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center"><FileArrowUp size={28} className="text-crimson-400"/><span className="mt-3 text-sm font-semibold text-bone-50">{t('verification.document')}</span><span className="mt-1 text-xs text-bone-500">{document?.name??t('verification.chooseFile')}</span><input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setDocument(e.target.files?.[0]??null)}/></label><label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center"><FileArrowUp size={28} className="text-crimson-400"/><span className="mt-3 text-sm font-semibold text-bone-50">{t('verification.selfie')}</span><span className="mt-1 text-xs text-bone-500">{selfie?.name??t('verification.chooseFile')}</span><input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={e=>setSelfie(e.target.files?.[0]??null)}/></label></div>{kyc.status==='rejected'?<div className="mt-6 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-300"><strong className="text-bone-50">{t('verification.rejectedReason')}</strong><span className="ml-2">{kyc.reason??t('verification.rejectedGeneric')}</span></div>:null}{success?<p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/5 p-4 text-sm text-bone-50">{t('verification.submitSuccess')}</p>:null}{error?<p role="alert" className="mt-6 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(error)}</p>:null}<div className="mt-6 flex justify-end"><Botao onClick={()=>void upload()} loading={loading} disabled={!document||!selfie}><ShieldCheck size={18}/>{t('verification.submit')}</Botao></div></Ficha></section>;
}
