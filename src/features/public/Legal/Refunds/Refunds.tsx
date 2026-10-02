import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Refunds() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.refunds.title")}
      description={t("public.refunds.description")}
      emptyState={{ message: t("public.refunds.empty"), action: null }}
    />
  );
}
