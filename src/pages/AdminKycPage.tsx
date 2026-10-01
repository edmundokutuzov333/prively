import { useEffect, useState } from 'react';
import { CheckCircle, FileArrowUp, ShieldCheck, XCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';
import { platformErrorKey } from '@/lib/errors';

type Kyc={id:string;user_id:string;email:string;handle:string;status:string;provider:string;provider_ref:string|null;doc_path:string;selfie_path:string;reason:string|null;created_at:string;reviewed_at:string|null};

export function AdminKycPage(){
 const {t}=useTranslation(); const [rows,setRows]=useState<Kyc[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
 const load=async()=>{setLoading(true);const {data,error:rpcError}=await requireSupabase().rpc('get_admin_kyc_queue',{_limit:100});setLoading(false);if(rpcError){setError(platformErrorKey(rpcError));return;}setRows((data??[]) as Kyc[]);};
 useEffect(()=>{void load();},[]);
 const decide=async(id:string,approved:boolean)=>{
  setLoading(true);
  setError(null);
  const result=await requireSupabase().functions.invoke('kyc-review',{body:{kycId:id,approved,reason:approved?'Approved by admin':'Rejected by admin'}});
  setLoading(false);
  if(result.error){setError(platformErrorKey(result.error));return;}
  void load();
};
 const open=async(path:string)=>{const result=await requireSupabase().storage.from('prively-kyc').createSignedUrl(path,60);if(result.error){setError(result.error.message);return;}window.open(result.data.signedUrl,'_blank','noopener,noreferrer');};
 return <section className="space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={18}/>{t('admin.areas.kyc')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('adminKyc.title')}</h1></div>{error?<p role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(error)}</p>:null}<div className="space-y-4">{rows.map((row)=><Ficha key={row.id} className="p-5"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><p className="font-semibold text-bone-50">{row.email}</p><p className="mt-1 text-sm text-bone-500">@{row.handle} · {row.status}</p><p className="mt-3 text-xs text-bone-500">{row.provider} · {new Date(row.created_at).toLocaleString()}</p><div className="mt-4 flex flex-wrap gap-2"><Botao variant="outline" onClick={()=>void open(row.doc_path)}><FileArrowUp size={17}/>{t('adminKyc.document')}</Botao><Botao variant="outline" onClick={()=>void open(row.selfie_path)}><FileArrowUp size={17}/>{t('adminKyc.selfie')}</Botao></div></div>{row.status==='pending'||row.status==='review'?<div className="flex gap-2"><Botao onClick={()=>void decide(row.id,true)} loading={loading}><CheckCircle size={18}/>{t('adminKyc.approve')}</Botao><Botao variant="danger" onClick={()=>void decide(row.id,false)} loading={loading}><XCircle size={18}/>{t('adminKyc.reject')}</Botao></div>:null}</div></Ficha>)}{!rows.length&&!loading?<p className="text-sm text-bone-500">{t('adminKyc.empty')}</p>:null}</div></section>;
}
