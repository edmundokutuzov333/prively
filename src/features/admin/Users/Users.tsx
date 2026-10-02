import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Users() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.users.title")} description={t("adminPages.users.description")} emptyState={{ message: t("adminPages.users.empty") }} />;
}
