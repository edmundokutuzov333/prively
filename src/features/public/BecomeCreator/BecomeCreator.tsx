import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

export default function BecomeCreator() {
  const { t } = useTranslation();
  const steps = [1, 2, 3, 4] as const;
  return (
    <PageShell
      title={t("public.becomeCreator.title")}
      description={t("public.becomeCreator.description")}
      emptyState={{
        message: t("public.becomeCreator.empty"),
        action: (
          <div className="space-y-5">
            <ol className="grid gap-3 text-sm leading-6 text-bone-300">
              {steps.map((step) => <li key={step} className="rounded-xl border border-bone-50/8 bg-ink-950/40 px-4 py-3">{step}. {t(`public.becomeCreator.step${step}`)}</li>)}
            </ol>
            <Link to={{ pathname: ROUTES.AGE_GATE, search: "?role=creator" }} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900">
              {t("public.becomeCreator.cta")}
            </Link>
          </div>
        ),
      }}
    />
  );
}
