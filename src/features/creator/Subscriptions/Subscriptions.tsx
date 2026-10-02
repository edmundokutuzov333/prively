import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Subscriptions() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.subscriptions.title")} description={t("creator.subscriptions.description")} emptyState={{ message: t("creator.subscriptions.empty") }} />;
}
