import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Recover() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.recover.title")} description={t("authPages.recover.description")} emptyState={{ message: t("authPages.recover.empty"), action: null }} />;
}
