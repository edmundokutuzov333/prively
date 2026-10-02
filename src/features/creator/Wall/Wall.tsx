import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Wall() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.wall.title")} description={t("creator.wall.description")} emptyState={{ message: t("creator.wall.empty") }} />;
}
