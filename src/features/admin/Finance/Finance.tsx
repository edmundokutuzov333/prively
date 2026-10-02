import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Finance() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.finance.title")} description={t("adminPages.finance.description")} emptyState={{ message: t("adminPages.finance.empty") }} />;
}
