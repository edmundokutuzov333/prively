import { useEffect, useState } from 'react';
import { ShieldCheck, UserCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';

type Row={id:string;email:string|null;handle:string;display_name:string;status:string;age_verified_at:string|null;self_excluded_until:string|null;roles:string[]};

export function AdminUsersPage(){
 const {t}=useTranslation(); const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null);
 const load=async()=>{setLoading(true);const {data,error:rpcError}=await requireSupabase().rpc('get_admin_users',{_limit:100,_offset:0});setLoading(false);if(rpcError){setError(rpcError.message);return;}setRows((data??[]) as Row[]);};
 useEffect(()=>{void load();},[]);
 const state=(id:string,status:string)=>async()=>{setLoading(true);const result=await requireSupabase().rpc('set_account_state',{_user_id:id,_status:status,_reason:'Admin action'});setLoading(false);if(result.error)setError(result.error.message);else void load();};
 return <section className="space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={18}/>{t('admin.areas.users')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('adminUsers.title')}</h1></div>{error?<p role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{error}</p>:null}<div className="space-y-3">{rows.map((row)=><Ficha key={row.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-3"><UserCircle size={24} className="text-crimson-400"/><div><p className="truncate font-semibold text-bone-50">{row.display_name}</p><p className="truncate text-sm text-bone-500">@{row.handle} · {row.email ?? '—'}</p></div></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-bone-500"><span>{row.status}</span>{row.age_verified_at?<span>{t('adminUsers.verified')}</span>:null}{row.roles.map((role)=><span key={role} className="rounded-full border border-bone-50/10 px-2 py-1">{role}</span>)}</div></div><div className="flex flex-wrap gap-2">{row.status!=='active'?<Botao variant="outline" onClick={()=>void state(row.id,'active')}>{t('adminUsers.activate')}</Botao>:null}{row.status!=='suspended'?<Botao variant="outline" onClick={()=>void state(row.id,'suspended')}>{t('adminUsers.suspend')}</Botao>:null}{row.status!=='banned'?<Botao variant="danger" onClick={()=>void state(row.id,'banned')}>{t('adminUsers.ban')}</Botao>:null}</div></div></Ficha>)}</div>{!rows.length&&!loading?<p className="text-sm text-bone-500">{t('adminUsers.empty')}</p>:null}</section>;
}
