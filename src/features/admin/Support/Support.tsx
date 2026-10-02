import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Support() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.support.title")} description={t("adminPages.support.description")} emptyState={{ message: t("adminPages.support.empty") }} />;
}
