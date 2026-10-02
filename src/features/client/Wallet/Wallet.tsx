import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Wallet() {
  const { t } = useTranslation();
  return <PageShell title={t("client.wallet.title")} description={t("client.wallet.description")} emptyState={{ message: t("client.wallet.empty") }} />;
}
