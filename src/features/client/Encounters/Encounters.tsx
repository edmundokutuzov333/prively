import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Encounters() {
  const { t } = useTranslation();
  return <PageShell title={t("client.encounters.title")} description={t("client.encounters.description")} emptyState={{ message: t("client.encounters.empty") }} />;
}
