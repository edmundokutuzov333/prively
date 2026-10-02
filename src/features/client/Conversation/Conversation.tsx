import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Conversation() {
  const { t } = useTranslation();
  return <PageShell title={t("client.conversation.title")} description={t("client.conversation.description")} emptyState={{ message: t("client.conversation.empty") }} />;
}
