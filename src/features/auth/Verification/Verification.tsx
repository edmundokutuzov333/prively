import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileArrowUp, ShieldCheck } from "@phosphor-icons/react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/app/session";
import { requireSupabase } from "@/lib/supabase";
import { platformErrorKey } from "@/lib/errors";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { Ficha } from "@/design/Ficha";
import { Botao } from "@/design/Botao";
import { ROUTES } from "@/lib/routes";

type KycStatus = {
  status: "pending" | "review" | "approved" | "rejected" | null;
  reason: string | null;
  provider: string | null;
  created_at: string | null;
  reviewed_at: string | null;
};

type LoadState = PageState;

const emptyKyc: KycStatus = {
  status: null,
  reason: null,
  provider: null,
  created_at: null,
  reviewed_at: null,
};

const maxFileSize = 10 * 1024 * 1024;

export default function Verification() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [kyc, setKyc] = useState<KycStatus>(emptyKyc);
  const [pageState, setPageState] = useState<LoadState>("loading");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadStatus = async () => {
    if (!user) {
      setKyc(emptyKyc);
      setPageState("forbidden");
      return;
    }

    setPageState("loading");
    setMessageKey(null);

    try {
      const { data, error } = await requireSupabase().rpc("get_my_kyc_status");
      if (error) throw error;

      const row = (data as KycStatus[] | null)?.[0] ?? emptyKyc;
      setKyc(row);
      setPageState(row.status === "approved" || row.status === "pending" || row.status === "review" ? "success" : "empty");
    } catch (error) {
      setPageState(navigator.onLine ? "error" : "offline");
      setMessageKey(platformErrorKey(error));
    }
  };

  useEffect(() => {
    if (authLoading) {
      setPageState("loading");
      return;
    }
    void loadStatus();
  }, [authLoading, user?.id]);

  const submit = async () => {
    if (!user || !documentFile || !selfieFile || busy) return;

    if (documentFile.size > maxFileSize || selfieFile.size > maxFileSize) {
      setMessageKey("authPages.verification.fileTooLarge");
      setPageState("error");
      return;
    }

    setBusy(true);
    setMessageKey(null);
    setSuccess(false);

    const sb = requireSupabase();
    const extension = (filename: string, fallback: string) => filename.split(".").pop()?.toLowerCase() || fallback;
    const documentPath = user.id + "/" + crypto.randomUUID() + "-document." + extension(documentFile.name, "bin");
    const selfiePath = user.id + "/" + crypto.randomUUID() + "-selfie." + extension(selfieFile.name, "jpg");

    try {
      const documentUpload = await sb.storage
        .from("prively-kyc")
        .upload(documentPath, documentFile, { upsert: false, contentType: documentFile.type });

      if (documentUpload.error) throw documentUpload.error;

      const selfieUpload = await sb.storage
        .from("prively-kyc")
        .upload(selfiePath, selfieFile, { upsert: false, contentType: selfieFile.type });

      if (selfieUpload.error) {
        await sb.storage.from("prively-kyc").remove([documentPath]);
        throw selfieUpload.error;
      }

      const submission = await sb.functions.invoke("kyc-start", {
        body: {
          docPath: documentPath,
          selfiePath,
          docType: "identity_document",
        },
      });

      if (submission.error) {
        await sb.storage.from("prively-kyc").remove([documentPath, selfiePath]);
        throw submission.error;
      }

      setKyc({
        status: "pending",
        reason: null,
        provider: "manual",
        created_at: new Date().toISOString(),
        reviewed_at: null,
      });
      setDocumentFile(null);
      setSelfieFile(null);
      setSuccess(true);
      setPageState("success");
    } catch (error) {
      setPageState(navigator.onLine ? "error" : "offline");
      setMessageKey(platformErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  let stateContent: ReactNode = null;

  if (pageState === "loading") {
    stateContent = (
      <PageShell
        title={t("authPages.verification.title")}
        description={t("authPages.verification.description")}
        state="loading"
        emptyState={{ message: t("pageShell.loading") }}
      />
    );
  }

  if (pageState === "forbidden") {
    stateContent = (
      <PageShell
        title={t("authPages.verification.title")}
        description={t("authPages.verification.description")}
        state="forbidden"
        emptyState={{
          message: t("authPages.verification.authRequired"),
          action: <Link to={ROUTES.LOGIN} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("authPages.verification.goLogin")}</Link>,
        }}
      />
    );
  }

  if (pageState === "error" || pageState === "offline") {
    stateContent = (
      <PageShell
        title={t("authPages.verification.title")}
        description={t("authPages.verification.description")}
        state={pageState}
        emptyState={{
          message: messageKey?.startsWith("authPages.") ? t(messageKey) : t(pageState === "offline" ? "pageShell.offline" : "pageShell.error"),
          action: <button type="button" onClick={() => void loadStatus()} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("authPages.verification.retry")}</button>,
        }}
      />
    );
  }

  if (stateContent) return stateContent;

  if (kyc.status === "approved") {
    return (
      <PageShell title={t("authPages.verification.title")} description={t("authPages.verification.description")} state="success">
        <Ficha variant="focus" className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <ShieldCheck size={28} weight="duotone" className="mt-1 text-bone-50" />
            <div>
              <p className="text-base leading-7 text-bone-100">{t("authPages.verification.approved")}</p>
              <Link to={ROUTES.ONBOARDING_CLIENT} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("authPages.verification.goWelcome")}</Link>
            </div>
          </div>
        </Ficha>
      </PageShell>
    );
  }

  if (kyc.status === "pending" || kyc.status === "review") {
    return (
      <PageShell title={t("authPages.verification.title")} description={t("authPages.verification.description")} state="success">
        <Ficha variant="focus" className="p-6 md:p-8">
          <p className="text-base leading-7 text-bone-100">{t(kyc.status === "review" ? "authPages.verification.review" : "authPages.verification.pending")}</p>
          <p className="mt-5 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-300">
            {t("authPages.verification.status")}: <strong className="text-bone-50">{t("authPages.verification.states." + kyc.status)}</strong>
          </p>
        </Ficha>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t("authPages.verification.title")}
      description={t("authPages.verification.description")}
      state="empty"
    >
      <Ficha variant="focus" className="p-6 md:p-8">
        <div className="mb-6 flex items-start gap-3">
          <ShieldCheck size={24} weight="duotone" className="mt-1 text-bone-50" />
          <p className="max-w-2xl text-sm leading-6 text-bone-300">{t(kyc.status === "rejected" ? "authPages.verification.rejectedIntro" : "authPages.verification.intro")}</p>
        </div>

        {kyc.status === "rejected" ? (
          <div className="mb-6 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm text-bone-300">
            <strong className="text-bone-50">{t("authPages.verification.rejectedReason")}</strong>
            <span className="ml-2">{kyc.reason ?? t("authPages.verification.rejectedGeneric")}</span>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center">
            <FileArrowUp size={28} className="text-crimson-400" />
            <span className="mt-3 text-sm font-semibold text-bone-50">{t("authPages.verification.document")}</span>
            <span className="mt-1 text-xs text-bone-500">{documentFile?.name ?? t("authPages.verification.chooseFile")}</span>
            <input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-6 text-center">
            <FileArrowUp size={28} className="text-crimson-400" />
            <span className="mt-3 text-sm font-semibold text-bone-50">{t("authPages.verification.selfie")}</span>
            <span className="mt-1 text-xs text-bone-500">{selfieFile?.name ?? t("authPages.verification.chooseFile")}</span>
            <input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={(event) => setSelfieFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>

        {success ? <p role="status" className="mt-6 rounded-md border border-ok/30 bg-ok/5 p-4 text-sm text-bone-50">{t("authPages.verification.submitSuccess")}</p> : null}
        {messageKey?.startsWith("errors.") ? <p role="alert" className="mt-6 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50">{t(messageKey)}</p> : null}

        <div className="mt-6 flex justify-end">
          <Botao type="button" onClick={() => void submit()} loading={busy} disabled={!documentFile || !selfieFile}>
            <ShieldCheck size={18} />
            {t("authPages.verification.submit")}
          </Botao>
        </div>
      </Ficha>
    </PageShell>
  );
}
