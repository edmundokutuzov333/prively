import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Purchases() {
  const { t } = useTranslation();
  return <PageShell title={t("client.purchases.title")} description={t("client.purchases.description")} emptyState={{ message: t("client.purchases.empty") }} />;
}
