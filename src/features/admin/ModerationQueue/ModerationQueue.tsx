import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function ModerationQueue() {
  const { t } = useTranslation();
  return <PageShell title={t("adminPages.moderationQueue.title")} description={t("adminPages.moderationQueue.description")} emptyState={{ message: t("adminPages.moderationQueue.empty") }} />;
}
