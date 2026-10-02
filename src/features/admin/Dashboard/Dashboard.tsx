import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Dashboard() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.dashboard.title")} description={t("adminPages.dashboard.description")} emptyState={{ message: t("adminPages.dashboard.empty") }} />;
}
