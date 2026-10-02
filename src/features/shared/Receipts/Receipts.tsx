import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Receipts() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.receipts.title")} description={t("shared.receipts.description")} emptyState={{ message: t("shared.receipts.empty") }} />;
}
