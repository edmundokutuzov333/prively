import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function AgeGate() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.ageGate.title")} description={t("authPages.ageGate.description")} emptyState={{ message: t("authPages.ageGate.empty"), action: <Link to={ROUTES.HOME} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50 no-underline hover:bg-ink-900">{t("authPages.ageGate.cta")}</Link> }} />;
}
