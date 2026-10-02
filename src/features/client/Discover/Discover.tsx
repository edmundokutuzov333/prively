import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Discover() {
  const { t } = useTranslation();
  return <PageShell title={t("client.discover.title")} description={t("client.discover.description")} emptyState={{ message: t("client.discover.empty") }} />;
}
