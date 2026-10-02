import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Products() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.products.title")} description={t("creator.products.description")} emptyState={{ message: t("creator.products.empty") }} />;
}
