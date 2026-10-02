import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Earnings() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.earnings.title")} description={t("creator.earnings.description")} emptyState={{ message: t("creator.earnings.empty") }} />;
}
