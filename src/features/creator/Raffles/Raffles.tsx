import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Raffles() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.raffles.title")} description={t("creator.raffles.description")} emptyState={{ message: t("creator.raffles.empty") }} />;
}
