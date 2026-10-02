import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { useTranslation } from "@/lib/i18n";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { Ficha } from "@/design/Ficha";
import { useAuth } from "@/app/session";
import { requireSupabase } from "@/lib/supabase";
import { platformErrorKey } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

type KycStatus = "pending" | "review" | "approved" | "rejected" | null;

type KycRow = {
  status: KycStatus;
  reason: string | null;
};

const emptyStatus: KycRow = { status: null, reason: null };

export default function OnboardingClient() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [kyc, setKyc] = useState<KycRow>(emptyStatus);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const steps = [1, 2, 3, 4] as const;

  const load = async () => {
    if (!user) {
      setPageState("forbidden");
      return;
    }

    setPageState("loading");
    setErrorKey(null);

    try {
      const { data, error } = await requireSupabase().rpc("get_my_kyc_status");
      if (error) throw error;
      const row = (data as KycRow[] | null)?.[0] ?? emptyStatus;
      setKyc(row);
      setPageState(row.status === "approved" ? "success" : "empty");
    } catch (error) {
      setPageState(navigator.onLine ? "error" : "offline");
      setErrorKey(platformErrorKey(error));
    }
  };

  useEffect(() => {
    if (authLoading) {
      setPageState("loading");
      return;
    }
    void load();
  }, [authLoading, user?.id]);

  if (pageState === "loading") {
    return <PageShell title={t("authPages.onboardingClient.title")} description={t("authPages.onboardingClient.description")} state="loading" emptyState={{ message: t("pageShell.loading") }} />;
  }

  if (pageState === "forbidden") {
    return (
      <PageShell
        title={t("authPages.onboardingClient.title")}
        description={t("authPages.onboardingClient.description")}
        state="forbidden"
        emptyState={{ message: t("authPages.onboardingClient.authRequired"), action: <Link to={ROUTES.LOGIN} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("authPages.onboardingClient.goLogin")}</Link> }}
      />
    );
  }

  if (pageState === "error" || pageState === "offline") {
    return (
      <PageShell
        title={t("authPages.onboardingClient.title")}
        description={t("authPages.onboardingClient.description")}
        state={pageState}
        emptyState={{
          message: pageState === "offline" ? t("pageShell.offline") : t("pageShell.error"),
          action: <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("authPages.onboardingClient.retry")}</button>,
        }}
      />
    );
  }

  if (kyc.status !== "approved") {
    const pending = kyc.status === "pending" || kyc.status === "review";
    const message = pending
      ? t(kyc.status === "review" ? "authPages.onboardingClient.kycReview" : "authPages.onboardingClient.kycPending")
      : kyc.status === "rejected"
        ? t("authPages.onboardingClient.kycRejected")
        : t("authPages.onboardingClient.kycRequired");

    return (
      <PageShell title={t("authPages.onboardingClient.title")} description={t("authPages.onboardingClient.description")} state="forbidden" emptyState={{
        message,
        action: (
          <Link to={ROUTES.VERIFICATION} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">
            {t("authPages.onboardingClient.goVerification")}
          </Link>
        ),
      }} />
    );
  }

  return (
    <PageShell title={t("authPages.onboardingClient.title")} description={t("authPages.onboardingClient.description")} state="success">
      <Ficha variant="focus" className="p-6 md:p-8">
        <div className="flex items-start gap-4">
          <CheckCircle size={28} weight="duotone" className="mt-1 text-bone-50" />
          <div className="flex-1">
            <p className="text-base leading-7 text-bone-100">{t("authPages.onboardingClient.kycApproved")}</p>
            <ol className="mt-6 grid gap-3 text-sm leading-6 text-bone-300">
              {steps.map((step) => (
                <li key={step} className="rounded-xl border border-bone-50/8 bg-ink-950/40 px-4 py-3">
                  {step}. {t("authPages.onboardingClient.step" + step)}
                </li>
              ))}
            </ol>
            {errorKey ? <p role="alert" className="mt-5 text-sm text-bone-300">{t(errorKey)}</p> : null}
          </div>
        </div>
      </Ficha>
    </PageShell>
  );
}
