import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Auctions() {
  const { t } = useTranslation();
  return <PageShell title={t("client.auctions.title")} description={t("client.auctions.description")} emptyState={{ message: t("client.auctions.empty") }} />;
}
