import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Security() {
  const { t } = useTranslation();
  return <PageShell title={t("client.security.title")} description={t("client.security.description")} emptyState={{ message: t("client.security.empty") }} />;
}
