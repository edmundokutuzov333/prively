import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Raffles() {
  const { t } = useTranslation();
  return <PageShell title={t("client.raffles.title")} description={t("client.raffles.description")} emptyState={{ message: t("client.raffles.empty") }} />;
}
