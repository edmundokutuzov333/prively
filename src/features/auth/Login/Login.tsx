import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Login() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.login.title")} description={t("authPages.login.description")} emptyState={{ message: t("authPages.login.empty"), action: null }} />;
}
