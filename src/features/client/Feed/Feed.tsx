import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Feed() {
  const { t } = useTranslation();
  return <PageShell title={t("client.feed.title")} description={t("client.feed.description")} emptyState={{ message: t("client.feed.empty") }} />;
}
