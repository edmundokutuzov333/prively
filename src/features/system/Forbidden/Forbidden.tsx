import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Forbidden() {
  const { t } = useTranslation();
  return <PageShell state="forbidden" title={t("systemPages.forbidden.title")} description={t("systemPages.forbidden.description")} emptyState={{ message: t("systemPages.forbidden.empty") }} />;
}
