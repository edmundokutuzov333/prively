import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Register() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.register.title")} description={t("authPages.register.description")} emptyState={{ message: t("authPages.register.empty"), action: null }} />;
}
