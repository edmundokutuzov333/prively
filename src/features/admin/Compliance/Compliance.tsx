import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Compliance() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.compliance.title")} description={t("adminPages.compliance.description")} emptyState={{ message: t("adminPages.compliance.empty") }} />;
}
