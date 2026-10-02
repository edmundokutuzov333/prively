import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Promotions() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.promotions.title")} description={t("creator.promotions.description")} emptyState={{ message: t("creator.promotions.empty") }} />;
}
