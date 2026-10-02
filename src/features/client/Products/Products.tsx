import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Products() {
  const { t } = useTranslation();
  return <PageShell title={t("client.products.title")} description={t("client.products.description")} emptyState={{ message: t("client.products.empty") }} />;
}
