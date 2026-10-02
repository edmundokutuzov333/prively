import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function NotFound() {
  const { t } = useTranslation();
  return <PageShell state="empty" title={t("systemPages.notFound.title")} description={t("systemPages.notFound.description")} emptyState={{ message: t("systemPages.notFound.empty") }} />;
}
