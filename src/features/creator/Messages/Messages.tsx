import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Messages() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.messages.title")} description={t("creator.messages.description")} emptyState={{ message: t("creator.messages.empty") }} />;
}
