import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Notifications() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.notifications.title")} description={t("shared.notifications.description")} emptyState={{ message: t("shared.notifications.empty") }} />;
}
