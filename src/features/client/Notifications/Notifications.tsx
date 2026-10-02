import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Notifications() {
  const { t } = useTranslation();
  return <PageShell title={t("client.notifications.title")} description={t("client.notifications.description")} emptyState={{ message: t("client.notifications.empty") }} />;
}
