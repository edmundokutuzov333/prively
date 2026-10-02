import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Profile() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.profile.title")} description={t("creator.profile.description")} emptyState={{ message: t("creator.profile.empty") }} />;
}
