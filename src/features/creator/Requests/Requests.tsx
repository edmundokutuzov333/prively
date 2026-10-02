import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Requests() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.requests.title")} description={t("creator.requests.description")} emptyState={{ message: t("creator.requests.empty") }} />;
}
