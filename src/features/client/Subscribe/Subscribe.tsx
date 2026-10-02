import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Subscribe() {
  const { t } = useTranslation();
  return <PageShell title={t("client.subscribe.title")} description={t("client.subscribe.description")} emptyState={{ message: t("client.subscribe.empty") }} />;
}
