import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Goals() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.goals.title")} description={t("creator.goals.description")} emptyState={{ message: t("creator.goals.empty") }} />;
}
