import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Report() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.report.title")} description={t("shared.report.description")} emptyState={{ message: t("shared.report.empty") }} />;
}
