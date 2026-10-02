import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Devices() {
  const { t } = useTranslation();
  return <PageShell title={t("shared.devices.title")} description={t("shared.devices.description")} emptyState={{ message: t("shared.devices.empty") }} />;
}
