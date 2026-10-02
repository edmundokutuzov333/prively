import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Store() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.store.title")} description={t("creator.store.description")} emptyState={{ message: t("creator.store.empty") }} />;
}
