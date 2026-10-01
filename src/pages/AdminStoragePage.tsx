import { Database, HardDrives, ShieldCheck, VideoCamera } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
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
      title="Storage"
      intro="Estado real de media, entrega de vídeo e backups."
      detail="Os valores apresentados vêm da base de dados. O tamanho B2 é o tamanho registado em media_assets, não uma medição externa do bucket."
    >
      {loading ? <p className="text-sm text-bone-500">A carregar estado de storage.</p> : null}
      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-control border border-danger/30 bg-danger/10 px-4 py-3">
          <p role="alert" className="m-0 text-sm text-danger">{error}</p>
          <Botao variant="outline" type="button" onClick={() => void load()}>Tentar novamente</Botao>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <Database size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">Backblaze B2</p>
              </div>
              <p className="mt-4 font-display text-4xl text-bone-50">{data.b2.asset_count}</p>
              <p className="mt-1 text-xs text-bone-500">media assets activos · {formatBytes(data.b2.registered_bytes)} registados</p>
            </Ficha>

            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <VideoCamera size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">Streamtape</p>
              </div>
              <div className="mt-4 space-y-2">
                {Object.keys(data.streamtape.status_counts).length ? Object.entries(data.streamtape.status_counts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-bone-300">{status}</span>
                    <span className="font-semibold text-bone-50">{count}</span>
                  </div>
                )) : <EstadoVazio title="Sem estados" body="Ainda não existem media com estado Streamtape registado." />}
              </div>
              <p className="mt-4 text-xs text-bone-500">{data.streamtape.failed_over_one_hour} falhas com mais de 1 hora</p>
            </Ficha>

            <Ficha className="p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck size={22} className="text-crimson-400" />
                <p className="m-0 text-sm text-bone-500">Backups</p>
              </div>
              <p className="mt-4 font-display text-4xl text-bone-50">{data.backups.runs}</p>
              {data.backups.last_success ? (
                <p className="mt-1 text-xs text-bone-500">Último sucesso: {new Date(data.backups.last_success).toLocaleString('pt-PT')}</p>
              ) : (
                <p className="mt-1 text-sm text-warn">Nenhum backup confirmado em backup_runs.</p>
              )}
              <p className="mt-3 text-xs text-bone-500">
                Workflow DB cron: {data.backups.cron_active ? 'activo' : 'não observado no pg_cron'}
              </p>
            </Ficha>
          </div>

          <Ficha className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-bone-50">Leitura operacional</p>
                <p className="mt-1 text-xs text-bone-500">
                  Última leitura: {new Date(data.generated_at).toLocaleString('pt-PT')}
                </p>
              </div>
              <Botao variant="outline" type="button" onClick={() => void load()}>Actualizar</Botao>
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
                <p className="mt-2 text-sm text-bone-200">{data.backups.runs} execuções registadas</p>
              </div>
            </div>
          </Ficha>
        </div>
      ) : null}
    </PageFrame>
  );
}
