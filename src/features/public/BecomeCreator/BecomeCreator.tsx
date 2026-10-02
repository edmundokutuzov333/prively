import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/app/session";
import { requireSupabase } from "@/lib/supabase";
import { platformErrorKey } from "@/lib/errors";

type CreatorState = "loading" | "unauthenticated" | "no_kyc" | "pending" | "ready" | "creator" | "error" | "offline";

export default function BecomeCreator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<CreatorState>("loading");
  const [busy, setBusy] = useState(false);
  const steps = [1, 2, 3, 4] as const;

  const inspect = async () => {
    if (!user) {
      setState("unauthenticated");
      return;
    }

    setState("loading");

    try {
      const sb = requireSupabase();
      const [{ data: creatorRole, error: roleError }, { data: kyc, error: kycError }] = await Promise.all([
        sb.rpc("has_role", { _uid: user.id, _role: "creator" }),
        sb.from("kyc_verifications")
          .select("status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (roleError) throw roleError;
      if (kycError) throw kycError;

      if (creatorRole === true) {
        setState("creator");
        navigate(ROUTES.ONBOARDING_CREATOR, { replace: true });
        return;
      }

      if (!kyc) {
        setState("no_kyc");
        return;
      }

      if (kyc.status === "pending" || kyc.status === "review") {
        setState("pending");
        return;
      }

      if (kyc.status !== "approved") {
        setState("no_kyc");
        return;
      }

      setState("ready");
    } catch {
      setState(navigator.onLine ? "error" : "offline");
    }
  };

  useEffect(() => {
    if (authLoading) {
      setState("loading");
      return;
    }
    void inspect();
  }, [authLoading, user?.id]);

  const becomeCreator = async () => {
    if (!user || busy) return;

    setBusy(true);
    try {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke("become-creator", {
        body: {},
      });

      if (error) {
        const key = platformErrorKey(error);
        throw new Error(key);
      }

      if (data?.ok !== true || data?.creator !== true) {
        throw new Error("errors.generic");
      }

      setState("creator");
      window.setTimeout(() => {
        navigate(ROUTES.ONBOARDING_CREATOR, { replace: true });
      }, 150);
    } catch (error) {
      const key = error instanceof Error && error.message.startsWith("errors.")
        ? error.message
        : platformErrorKey(error);
      if (key === "errors.kyc_pending") {
        setState("pending");
      } else if (key === "errors.kyc_required" || key === "errors.age_not_verified") {
        setState("no_kyc");
      } else {
        setState(navigator.onLine ? "error" : "offline");
      }
    } finally {
      setBusy(false);
    }
  };

  let pageState: PageState = "empty";
  let message = t("public.becomeCreator.empty");
  let action: ReactNode = (
    <div className="space-y-5">
      <ol className="grid gap-3 text-sm leading-6 text-bone-300">
        {steps.map((step) => (
          <li key={step} className="rounded-xl border border-bone-50/8 bg-ink-950/40 px-4 py-3">
            {step}. {t("public.becomeCreator.step" + step)}
          </li>
        ))}
      </ol>
      <Link
        to={{ pathname: ROUTES.AGE_GATE, search: "?role=creator" }}
        className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900"
      >
        {t("public.becomeCreator.cta")}
      </Link>
    </div>
  );

  if (state === "loading") {
    pageState = "loading";
    message = t("public.becomeCreator.checking");
    action = null;
  } else if (state === "unauthenticated") {
    message = t("public.becomeCreator.authRequired");
    action = (
      <Link
        to={{ pathname: ROUTES.AGE_GATE, search: "?role=creator" }}
        className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900"
      >
        {t("public.becomeCreator.goLogin")}
      </Link>
    );
  } else if (state === "pending") {
    pageState = "forbidden";
    message = t("public.becomeCreator.kycPending");
    action = (
      <Link to={ROUTES.VERIFICATION} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900">
        {t("public.becomeCreator.goVerification")}
      </Link>
    );
  } else if (state === "no_kyc") {
    pageState = "forbidden";
    message = t("public.becomeCreator.kycRequired");
    action = (
      <Link to={ROUTES.VERIFICATION} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900">
        {t("public.becomeCreator.goVerification")}
      </Link>
    );
  } else if (state === "ready") {
    pageState = "success";
    message = t("public.becomeCreator.description");
    action = (
      <button
        type="button"
        onClick={() => void becomeCreator()}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? t("public.becomeCreator.checking") : t("public.becomeCreator.grant")}
      </button>
    );
  } else if (state === "creator") {
    pageState = "success";
    message = t("public.becomeCreator.granted");
    action = null;
  } else if (state === "error") {
    pageState = "error";
    message = t("pageShell.error");
    action = (
      <button
        type="button"
        onClick={() => void inspect()}
        className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50"
      >
        {t("public.becomeCreator.retry")}
      </button>
    );
  } else if (state === "offline") {
    pageState = "offline";
    message = t("pageShell.offline");
    action = (
      <button
        type="button"
        onClick={() => void inspect()}
        className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50"
      >
        {t("public.becomeCreator.retry")}
      </button>
    );
  }

  return (
    <PageShell
      title={t("public.becomeCreator.title")}
      description={t("public.becomeCreator.description")}
      state={pageState}
      emptyState={{ message, action }}
    />
  );
}
