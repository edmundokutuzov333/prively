import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Dmca() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.dmca.title")}
      description={t("public.dmca.description")}
      emptyState={{ message: t("public.dmca.empty"), action: null }}
    />
  );
}
