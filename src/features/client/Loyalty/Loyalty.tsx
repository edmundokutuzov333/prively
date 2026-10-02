import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Loyalty() {
  const { t } = useTranslation();
  return <PageShell title={t("client.loyalty.title")} description={t("client.loyalty.description")} emptyState={{ message: t("client.loyalty.empty") }} />;
}
