import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Encounters() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.encounters.title")} description={t("creator.encounters.description")} emptyState={{ message: t("creator.encounters.empty") }} />;
}
