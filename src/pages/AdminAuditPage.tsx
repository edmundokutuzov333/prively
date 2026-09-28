import { useEffect, useState } from 'react';
import { ClipboardText, ShieldCheck } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { requireSupabase } from '@/lib/supabase';

type Event={id:number;user_id:string|null;actor_id:string|null;event_type:string;metadata:Record<string,unknown>;created_at:string};

export function AdminAuditPage(){
 const {t}=useTranslation();const [events,setEvents]=useState<Event[]>([]);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{void requireSupabase().rpc('get_admin_security_audit',{_limit:200}).then(({data,error:rpcError})=>{if(rpcError)setError(rpcError.message);else setEvents((data??[]) as Event[]);});},[]);
 return <section className="space-y-8"><div><p className="flex items-center gap-2 text-sm text-bone-500"><ClipboardText size={18}/>{t('admin.areas.audit')}</p><h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('adminAudit.title')}</h1></div>{error?<p role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{error}</p>:null}<div className="space-y-2">{events.map((event)=><Ficha key={event.id} className="p-5"><div className="flex items-start gap-4"><ShieldCheck size={20} className="mt-1 text-crimson-400"/><div className="min-w-0 flex-1"><p className="font-semibold text-bone-50">{event.event_type}</p><p className="mt-1 text-xs text-bone-500">{new Date(event.created_at).toLocaleString()}</p><pre className="mt-3 overflow-x-auto rounded-md bg-ink-850 p-3 text-xs text-bone-300">{JSON.stringify(event.metadata,null,2)}</pre></div></div></Ficha>)}{!events.length&&!error?<p className="text-sm text-bone-500">{t('adminAudit.empty')}</p>:null}</div></section>;
}
