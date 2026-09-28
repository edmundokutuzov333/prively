import { useEffect, useState } from 'react';
import { CheckCircle, Eye, GearSix, Play, WarningCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';

type Job = {
  job_id: string;
  asset_id: string;
  post_id: string | null;
  channel_id: string;
  job_type: string;
  job_status: string;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  available_at: string;
  created_at: string;
  storage_path: string;
  kind: string;
  mime_type: string | null;
  integrity_status: string;
  moderation_status: string;
  scan_status: string;
  original_filename: string | null;
};

export function AdminMediaQueuePage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error: rpcError } = await requireSupabase().rpc('get_media_processing_queue', { _limit: 100 });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setJobs((data ?? []) as Job[]);
  };

  useEffect(() => { void load(); }, []);

  const process = async (jobId: string) => {
    setProcessing(jobId);
    setError(null);
    const result = await requireSupabase().functions.invoke('process-media-job', { body: { jobId } });
    setProcessing(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  };

  const preview = async (assetId: string) => {
    setError(null);
    const result = await requireSupabase().functions.invoke('get-media-url', { body: { assetId } });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const payload = result.data as { url?: string };
    if (!payload.url) {
      setError(t('adminMedia.previewFailed'));
      return;
    }
    window.open(payload.url, '_blank', 'noopener,noreferrer');
  };

  return <section className="space-y-8">
    <div>
      <p className="flex items-center gap-2 text-sm text-bone-500"><GearSix size={18}/>{t('admin.areas.media')}</p>
      <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('adminMedia.title')}</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-bone-300">{t('adminMedia.body')}</p>
    </div>

    {error ? <p role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{error}</p> : null}

    <div className="space-y-3">
      {jobs.map((job) => <Ficha key={job.job_id} className="p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {job.job_status === 'succeeded' ? <CheckCircle className="text-ok"/> : job.job_status === 'failed' ? <WarningCircle className="text-danger"/> : <GearSix className="text-crimson-400"/>}
              <div className="min-w-0">
                <p className="truncate font-semibold text-bone-50">{job.original_filename ?? job.asset_id}</p>
                <p className="mt-1 text-xs text-bone-500">{job.job_type} · {job.job_status} · {job.kind} · {job.mime_type ?? 'unknown'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-bone-400">
              <span>{t('adminMedia.integrity')}: {job.integrity_status}</span>
              <span>{t('adminMedia.moderation')}: {job.moderation_status}</span>
              <span>{t('adminMedia.attempts')}: {job.attempts}</span>
            </div>
            {job.error_message ? <p className="mt-3 text-xs text-danger">{job.error_message}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Botao variant="outline" onClick={()=>void preview(job.asset_id)}><Eye size={17}/>{t('adminMedia.preview')}</Botao>
            <Botao onClick={()=>void process(job.job_id)} loading={processing===job.job_id}><Play size={17}/>{t('adminMedia.process')}</Botao>
          </div>
        </div>
      </Ficha>)}

      {!jobs.length && !loading ? <div className="rounded-md border border-dashed border-bone-50/10 p-6 text-sm text-bone-500">{t('adminMedia.empty')}</div> : null}
      {loading ? <p className="text-sm text-bone-500">{t('common.loading')}</p> : null}
    </div>
  </section>;
}
