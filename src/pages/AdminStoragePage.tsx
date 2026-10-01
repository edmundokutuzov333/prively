import { Database, HardDrives, ShieldCheck, VideoCamera } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Botao } from '@/design/Botao';
import { PageFrame } from '@/pages/PageFrame';
import { requireSupabase } from '@/lib/supabase';

type StorageStatus = {
  generated_at: string;
  b2: {
    asset_count: number;
    registered_bytes: number;
  };
  streamtape: {
    status_counts: Record<string, number>;
    failed_over_one_hour: number;
  };
  backups: {
    runs: number;
    last_success: string | null;
    last_status: string | null;
    cron_active: boolean;
  };
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

export function AdminStoragePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: rpcError } = await requireSupabase().rpc('get_admin_storage_status');
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    setData(result as StorageStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageFrame
      icon={HardDrives}
      title={t('phase14.storage.title')}
      intro={t('phase14.storage.intro')}
      detail={t('phase14.storage.detail')}
    >
      {loading ? <p className="text-sm text-bone-500">{t('phase14.storage.loading')}</p> : null}
      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-control border border-danger/30 bg-danger/10 px-4 py-3">
          <p role="alert" className="m-0 text-sm text-danger">{error}</p>
          <Botao variant="outline" type="button" onClick={() => void load()}>{t('phase14.storage.retry')}</Botao>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <Database size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">{t('phase14.storage.b2')}</p>
              </div>
              <p className="mt-4 font-display text-4xl text-bone-50">{data.b2.asset_count}</p>
              <p className="mt-1 text-xs text-bone-500">{data.b2.asset_count} {t('phase14.storage.activeAssets')} · {formatBytes(data.b2.registered_bytes)} {t('phase14.storage.registered')}</p>
            </Ficha>

            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <VideoCamera size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">{t('phase14.storage.streamtape')}</p>
              </div>
              <div className="mt-4 space-y-2">
                {Object.keys(data.streamtape.status_counts).length ? Object.entries(data.streamtape.status_counts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-bone-300">{status}</span>
                    <span className="font-semibold text-bone-50">{count}</span>
                  </div>
                )) : <EstadoVazio title="{t('phase14.storage.noStatuses')}" body="{t('phase14.storage.noStatusesBody')}" />}
              </div>
              <p className="mt-4 text-xs text-bone-500">{data.streamtape.failed_over_one_hour} {t('phase14.storage.oldFailures')}</p>
            </Ficha>

            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">{t('phase14.storage.backups')}</p>
              </div>
              <p className="mt-4 font-display text-4xl text-bone-50">{data.backups.runs}</p>
              {data.backups.last_success ? (
                <p className="mt-1 text-xs text-bone-500">{t('phase14.storage.lastSuccess')}: {new Date(data.backups.last_success).toLocaleString('pt-PT')}</p>
              ) : (
                <p className="mt-1 text-sm text-warn">{t('phase14.storage.noBackup')}</p>
              )}
              <p className="mt-3 text-xs text-bone-500">
                {t('phase14.storage.workflow')}: {data.backups.cron_active ? t('phase14.storage.active') : t('phase14.storage.notObserved')}
              </p>
            </Ficha>
          </div>

          <Ficha className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-bone-50">{t('phase14.storage.operational')}</p>
                <p className="mt-1 text-xs text-bone-500">
                  {t('phase14.storage.lastRead')}: {new Date(data.generated_at).toLocaleString('pt-PT')}
                </p>
              </div>
              <Botao variant="outline" type="button" onClick={() => void load()}>{t('phase14.storage.refresh')}</Botao>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-control border border-bone-50/8 p-4">
                <p className="text-xs text-bone-500">B2</p>
                <p className="mt-2 text-sm text-bone-200">{data.b2.asset_count} assets activos</p>
              </div>
              <div className="rounded-control border border-bone-50/8 p-4">
                <p className="text-xs text-bone-500">Streamtape</p>
                <p className="mt-2 text-sm text-bone-200">{data.streamtape.failed_over_one_hour} falhas antigas</p>
              </div>
              <div className="rounded-control border border-bone-50/8 p-4">
                <p className="text-xs text-bone-500">Backups</p>
                <p className="mt-2 text-sm text-bone-200">{data.backups.runs} {t('phase14.storage.executions')}</p>
              </div>
            </div>
          </Ficha>
        </div>
      ) : null}
    </PageFrame>
  );
}
