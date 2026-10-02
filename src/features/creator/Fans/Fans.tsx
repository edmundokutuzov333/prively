import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Fans() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.fans.title")} description={t("creator.fans.description")} emptyState={{ message: t("creator.fans.empty") }} />;
}
