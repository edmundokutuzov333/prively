import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Verification() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.verification.title")} description={t("authPages.verification.description")} emptyState={{ message: t("authPages.verification.empty"), action: null }} />;
}
