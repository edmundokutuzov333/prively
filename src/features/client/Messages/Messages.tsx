import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Messages() {
  const { t } = useTranslation();
  return <PageShell title={t("client.messages.title")} description={t("client.messages.description")} emptyState={{ message: t("client.messages.empty") }} />;
}
