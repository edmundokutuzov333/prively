import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Lives() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.lives.title")} description={t("creator.lives.description")} emptyState={{ message: t("creator.lives.empty") }} />;
}
