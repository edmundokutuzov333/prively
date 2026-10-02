import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function CreatorProfile() {
  const { t } = useTranslation();
  return <PageShell title={t("client.creatorProfile.title")} description={t("client.creatorProfile.description")} emptyState={{ message: t("client.creatorProfile.empty") }} />;
}
