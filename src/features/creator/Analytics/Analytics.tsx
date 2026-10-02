import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Analytics() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.analytics.title")} description={t("creator.analytics.description")} emptyState={{ message: t("creator.analytics.empty") }} />;
}
