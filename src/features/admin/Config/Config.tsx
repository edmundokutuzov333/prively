import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Config() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.config.title")} description={t("adminPages.config.description")} emptyState={{ message: t("adminPages.config.empty") }} />;
}
