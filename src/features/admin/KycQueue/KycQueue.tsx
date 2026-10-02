import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function KycQueue() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.kycQueue.title")} description={t("adminPages.kycQueue.description")} emptyState={{ message: t("adminPages.kycQueue.empty") }} />;
}
