import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Blocks() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.blocks.title")} description={t("creator.blocks.description")} emptyState={{ message: t("creator.blocks.empty") }} />;
}
