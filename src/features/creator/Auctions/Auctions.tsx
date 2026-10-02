import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Auctions() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.auctions.title")} description={t("creator.auctions.description")} emptyState={{ message: t("creator.auctions.empty") }} />;
}
