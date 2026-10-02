import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Referral() {
  const { t } = useTranslation();
  return <PageShell title={t("creator.referral.title")} description={t("creator.referral.description")} emptyState={{ message: t("creator.referral.empty") }} />;
}
