import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Wellbeing() {
  const { t } = useTranslation();
  return <PageShell title={t("client.wellbeing.title")} description={t("client.wellbeing.description")} emptyState={{ message: t("client.wellbeing.empty") }} />;
}
