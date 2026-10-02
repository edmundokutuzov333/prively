import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Error() {
  const { t } = useTranslation();
  return <PageShell state="empty" title={t("systemPages.error.title")} description={t("systemPages.error.description")} emptyState={{ message: t("systemPages.error.empty") }} />;
}
