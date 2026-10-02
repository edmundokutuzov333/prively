import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Studio() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.studio.title")} description={t("creator.studio.description")} emptyState={{ message: t("creator.studio.empty") }} />;
}
