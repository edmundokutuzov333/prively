import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Settings() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.settings.title")} description={t("shared.settings.description")} emptyState={{ message: t("shared.settings.empty") }} />;
}
