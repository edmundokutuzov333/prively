import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Offline() {
  const { t } = useTranslation();
  return <PageShell state="offline" title={t("systemPages.offline.title")} description={t("systemPages.offline.description")} emptyState={{ message: t("systemPages.offline.empty") }} />;
}
