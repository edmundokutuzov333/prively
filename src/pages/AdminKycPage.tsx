import { useEffect, useState } from 'react';
import { CheckCircle, FileArrowUp, ShieldCheck, XCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';
import { platformErrorKey } from '@/lib/errors';

type Kyc = {
  id:string; user_id:string; email:string; handle:string; status:string; provider:string;
  provider_ref:string|null; doc_path:string; selfie_path:string; reason:string|null;
  created_at:string; reviewed_at:string|null;
};
type VolumeRow = { week_start:string; count:number };

export function AdminKycPage() {
  const { t } = useTranslation();
  const [rows,setRows] = useState<Kyc[]>([]);
  const [volume,setVolume] = useState<VolumeRow[]>([]);
  const [loading,setLoading] = useState(false);
  const [volumeLoading,setVolumeLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [volumeError,setVolumeError] = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    const { data,error:rpcError } = await requireSupabase().rpc('get_admin_kyc_queue',{_limit:100});
    setLoading(false);
    if (rpcError) { setError(platformErrorKey(rpcError)); return; }
    setRows((data ?? []) as Kyc[]);
  };

  const loadVolume = async () => {
    setVolumeLoading(true);
    const { data,error:rpcError } = await requireSupabase().rpc('kyc_manual_queue_weekly_volume_guarded');
    setVolumeLoading(false);
    if (rpcError) { setVolumeError(platformErrorKey(rpcError)); return; }
    setVolume((data ?? []) as VolumeRow[]);
  };

  useEffect(() => {
    void load();
    void loadVolume();
  }, []);

  const decide = async (id:string,approved:boolean) => {
    setLoading(true);
    setError(null);
    const result = await requireSupabase().functions.invoke('kyc-review',{
      body:{kycId:id,approved,reason:approved ? 'Approved by compliance' : 'Rejected by compliance'}
    });
    setLoading(false);
    if(result.error){setError(platformErrorKey(result.error));return;}
    await Promise.all([load(),loadVolume()]);
  };

  const open = async(path:string) => {
    const result = await requireSupabase().storage.from('prively-kyc').createSignedUrl(path,60);
    if(result.error){setError(platformErrorKey(result.error));return;}
    window.open(result.data.signedUrl,'_blank','noopener,noreferrer');
  };

  const formatWeek = (value:string) => new Intl.DateTimeFormat('pt-MZ',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));

  return <section className="space-y-8">
    <div>
      <p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={18}/>{t('admin.areas.kyc')}</p>
      <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('adminKyc.title')}</h1>
    </div>

    {error ? <p role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(error)}</p> : null}

    <Ficha className="p-5 md:p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-bone-500">{t('adminKyc.manualVolume.eyebrow')}</p>
      <h2 className="mt-2 text-xl font-semibold text-bone-50">{t('adminKyc.manualVolume.title')}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-bone-400">{t('adminKyc.manualVolume.body')}</p>
      {volumeError ? <p role="alert" className="mt-5 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(volumeError)}</p> : null}
      {volumeLoading ? <div className="mt-5 grid gap-3 md:grid-cols-4" aria-busy="true">{[1,2,3,4].map((item)=><div key={item} className="h-20 animate-pulse rounded-md bg-ink-850"/>)}</div> : null}
      {!volumeLoading && !volumeError && !volume.length ? <p className="mt-5 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-500">{t('adminKyc.manualVolume.empty')}</p> : null}
      {!volumeLoading && !volumeError && volume.length ? <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead><tr className="border-b border-bone-50/8 text-left text-xs uppercase tracking-[0.12em] text-bone-500"><th className="px-3 py-3 font-medium">{t('adminKyc.manualVolume.week')}</th><th className="px-3 py-3 text-right font-medium">{t('adminKyc.manualVolume.requests')}</th></tr></thead>
          <tbody>{volume.map((row)=><tr key={row.week_start} className="border-b border-bone-50/6 last:border-0"><td className="px-3 py-3 text-bone-300">{formatWeek(row.week_start)}</td><td className="px-3 py-3 text-right font-semibold text-bone-50">{row.count}</td></tr>)}</tbody>
        </table>
      </div> : null}
    </Ficha>

    <div className="space-y-4">
      {rows.map((row)=><Ficha key={row.id} className="p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="font-semibold text-bone-50">{row.email}</p>
            <p className="mt-1 text-sm text-bone-500">@{row.handle} · {row.status}</p>
            <p className="mt-3 text-xs text-bone-500">{row.provider} · {new Date(row.created_at).toLocaleString()}</p>
            {row.reason ? <p className="mt-3 max-w-2xl text-sm text-bone-300">{row.reason}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Botao variant="outline" onClick={()=>void open(row.doc_path)}><FileArrowUp size={17}/>{t('adminKyc.document')}</Botao>
              <Botao variant="outline" onClick={()=>void open(row.selfie_path)}><FileArrowUp size={17}/>{t('adminKyc.selfie')}</Botao>
            </div>
          </div>
          {row.status==='pending'||row.status==='review' ? <div className="flex gap-2">
            <Botao onClick={()=>void decide(row.id,true)} loading={loading}><CheckCircle size={18}/>{t('adminKyc.approve')}</Botao>
            <Botao variant="danger" onClick={()=>void decide(row.id,false)} loading={loading}><XCircle size={18}/>{t('adminKyc.reject')}</Botao>
          </div> : null}
        </div>
      </Ficha>)}
      {loading && !rows.length ? <div className="space-y-3" aria-busy="true">{[1,2,3].map((item)=><div key={item} className="h-28 animate-pulse rounded-md bg-ink-850"/>)}</div> : null}
      {!rows.length && !loading ? <div className="rounded-md border border-bone-50/8 bg-ink-850 p-6 text-sm text-bone-500">{t('adminKyc.empty')}</div> : null}
    </div>
  </section>;
}
