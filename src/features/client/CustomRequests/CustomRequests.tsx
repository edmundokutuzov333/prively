import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function CustomRequests() {
  const { t } = useTranslation();
  return <PageShell title={t("client.customRequests.title")} description={t("client.customRequests.description")} emptyState={{ message: t("client.customRequests.empty") }} />;
}
