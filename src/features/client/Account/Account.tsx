import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Account() {
  const { t } = useTranslation();
  return <PageShell title={t("client.account.title")} description={t("client.account.description")} emptyState={{ message: t("client.account.empty") }} />;
}
