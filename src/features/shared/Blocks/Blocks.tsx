import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Blocks() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.blocks.title")} description={t("shared.blocks.description")} emptyState={{ message: t("shared.blocks.empty") }} />;
}
