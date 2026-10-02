import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function PpvPurchase() {
  const { t } = useTranslation();
  return <PageShell title={t("client.ppvPurchase.title")} description={t("client.ppvPurchase.description")} emptyState={{ message: t("client.ppvPurchase.empty") }} />;
}
