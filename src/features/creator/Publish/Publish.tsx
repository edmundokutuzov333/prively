import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Publish() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.publish.title")} description={t("creator.publish.description")} emptyState={{ message: t("creator.publish.empty") }} />;
}
