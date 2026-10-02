import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Discreet() {
  const { t } = useTranslation();
  return <PageShell title={t("client.discreet.title")} description={t("client.discreet.description")} emptyState={{ message: t("client.discreet.empty") }} />;
}
