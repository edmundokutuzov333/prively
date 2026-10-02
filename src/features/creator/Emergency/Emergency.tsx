import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Emergency() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.emergency.title")} description={t("creator.emergency.description")} emptyState={{ message: t("creator.emergency.empty") }} />;
}
