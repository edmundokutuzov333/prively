import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Wishlist() {
  const { t } = useTranslation();
  return <PageShell title={t("client.wishlist.title")} description={t("client.wishlist.description")} emptyState={{ message: t("client.wishlist.empty") }} />;
}
