import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function ProductionGate() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.productionGate.title")} description={t("adminPages.productionGate.description")} emptyState={{ message: t("adminPages.productionGate.empty") }} />;
}
