import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function CreateChannel() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.createChannel.title")} description={t("creator.createChannel.description")} emptyState={{ message: t("creator.createChannel.empty") }} />;
}
