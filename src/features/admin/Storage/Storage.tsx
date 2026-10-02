import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Storage() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.storage.title")} description={t("adminPages.storage.description")} emptyState={{ message: t("adminPages.storage.empty") }} />;
}
