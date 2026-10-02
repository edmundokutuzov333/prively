import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

export default function BecomeCreator() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.becomeCreator.title")}
      description={t("public.becomeCreator.description")}
      emptyState={{ message: t("public.becomeCreator.empty"), action: (<Link to={ROUTES.AGE_GATE} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900">{t("public.becomeCreator.cta")}</Link>) }}
    />
  );
}
