import { useEffect, useRef, useState } from "react";
import { CheckCircle, FileArrowUp, ShieldCheck, XCircle } from "@phosphor-icons/react";
import { useTranslation } from "@/lib/i18n";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { Ficha } from "@/design/Ficha";
import { Botao } from "@/design/Botao";
import { requireSupabase } from "@/lib/supabase";
import { platformErrorKey } from "@/lib/errors";

type KycRow = {
  id: string;
  user_id: string;
  email: string;
  handle: string;
  status: "pending" | "review" | "approved" | "rejected";
  provider: string;
  provider_ref: string | null;
  doc_path: string;
  selfie_path: string;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type VolumeRow = { week_start: string; count: number };

export default function KycQueue() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<KycRow[]>([]);
  const [volume, setVolume] = useState<VolumeRow[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [volumeState, setVolumeState] = useState<PageState>("loading");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [volumeErrorKey, setVolumeErrorKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadQueue = async () => {
    setPageState("loading");
    setErrorKey(null);
    try {
      const { data, error } = await requireSupabase().rpc("get_admin_kyc_queue", { _limit: 100 });
      if (error) throw error;
      if (!mountedRef.current) return;
      const nextRows = (data ?? []) as KycRow[];
      setRows(nextRows);
      setPageState(nextRows.length ? "success" : "empty");
    } catch (error) {
      if (!mountedRef.current) return;
      const key = platformErrorKey(error);
      setErrorKey(key);
      setPageState(key === "errors.forbidden" ? "forbidden" : navigator.onLine ? "error" : "offline");
    }
  };

  const loadVolume = async () => {
    setVolumeState("loading");
    setVolumeErrorKey(null);
    try {
      const { data, error } = await requireSupabase().rpc("kyc_manual_queue_weekly_volume_guarded");
      if (error) throw error;
      if (!mountedRef.current) return;
      const nextVolume = (data ?? []) as VolumeRow[];
      setVolume(nextVolume);
      setVolumeState(nextVolume.length ? "success" : "empty");
    } catch (error) {
      if (!mountedRef.current) return;
      const key = platformErrorKey(error);
      setVolumeErrorKey(key);
      setVolumeState(key === "errors.forbidden" ? "forbidden" : navigator.onLine ? "error" : "offline");
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void Promise.all([loadQueue(), loadVolume()]);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const decide = async (id: string, approved: boolean) => {
    setBusyId(id);
    setErrorKey(null);
    try {
      const { error } = await requireSupabase().functions.invoke("kyc-review", {
        body: {
          kycId: id,
          approved,
          reason: t(approved ? "adminPages.kycQueue.approveReason" : "adminPages.kycQueue.rejectReason"),
        },
      });
      if (error) throw error;
      await Promise.all([loadQueue(), loadVolume()]);
    } catch (error) {
      setErrorKey(platformErrorKey(error));
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = async (path: string) => {
    const { data, error } = await requireSupabase().storage.from("prively-kyc").createSignedUrl(path, 60);
    if (error) {
      setErrorKey(platformErrorKey(error));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const formatWeek = (value: string) => new Intl.DateTimeFormat("pt-MZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

  return (
    <PageShell
      title={t("adminPages.kycQueue.title")}
      description={t("adminPages.kycQueue.description")}
      state={pageState}
      emptyState={pageState === "empty" ? { message: t("adminPages.kycQueue.empty") } : undefined}
    >
      <div className="space-y-6">
        {errorKey ? (
          <div role="alert" className="rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(errorKey)}</div>
        ) : null}

        <Ficha className="p-5 md:p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-bone-500">{t("adminPages.kycQueue.volumeEyebrow")}</p>
          <h2 className="mt-2 text-xl font-semibold text-bone-50">{t("adminPages.kycQueue.volumeTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-bone-400">{t("adminPages.kycQueue.volumeDescription")}</p>
          {volumeState === "loading" ? <div className="mt-5 grid gap-3 md:grid-cols-4" aria-busy="true">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse rounded-md bg-ink-850" />)}</div> : null}
          {volumeErrorKey ? <p role="alert" className="mt-5 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(volumeErrorKey)}</p> : null}
          {volumeState === "empty" ? <p className="mt-5 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-500">{t("adminPages.kycQueue.volumeEmpty")}</p> : null}
          {volumeState === "success" ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-bone-50/8 text-left text-xs uppercase tracking-[0.12em] text-bone-500">
                    <th className="px-3 py-3 font-medium">{t("adminPages.kycQueue.week")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("adminPages.kycQueue.requests")}</th>
                  </tr>
                </thead>
                <tbody>
                  {volume.map((item) => (
                    <tr key={item.week_start} className="border-b border-bone-50/6 last:border-0">
                      <td className="px-3 py-3 text-bone-300">{formatWeek(item.week_start)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-bone-50">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Ficha>

        {pageState === "empty" ? (
          <Ficha className="p-6">
            <p className="text-sm text-bone-500">{t("adminPages.kycQueue.empty")}</p>
          </Ficha>
        ) : null}

        {rows.length ? (
          <div className="space-y-4">
            {rows.map((row) => (
              <Ficha key={row.id} className="p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <ShieldCheck size={22} weight="duotone" className="mt-1 text-bone-50" />
                      <div>
                        <p className="font-semibold text-bone-50">{row.email}</p>
                        <p className="mt-1 text-sm text-bone-500">@{row.handle} · {t("adminPages.kycQueue.states." + row.status)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-bone-500">{row.provider} · {new Date(row.created_at).toLocaleString("pt-MZ")}</p>
                    {row.reason ? <p className="mt-3 max-w-2xl text-sm text-bone-300">{row.reason}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Botao variant="outline" onClick={() => void openDocument(row.doc_path)}><FileArrowUp size={17} />{t("adminPages.kycQueue.document")}</Botao>
                      <Botao variant="outline" onClick={() => void openDocument(row.selfie_path)}><FileArrowUp size={17} />{t("adminPages.kycQueue.selfie")}</Botao>
                    </div>
                  </div>
                  {row.status === "pending" || row.status === "review" ? (
                    <div className="flex shrink-0 gap-2">
                      <Botao onClick={() => void decide(row.id, true)} loading={busyId === row.id}><CheckCircle size={18} />{t("adminPages.kycQueue.approve")}</Botao>
                      <Botao variant="danger" onClick={() => void decide(row.id, false)} loading={busyId === row.id}><XCircle size={18} />{t("adminPages.kycQueue.reject")}</Botao>
                    </div>
                  ) : null}
                </div>
              </Ficha>
            ))}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
