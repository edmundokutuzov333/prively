import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Terms() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.terms.title")}
      description={t("public.terms.description")}
      emptyState={{ message: t("public.terms.empty"), action: null }}
    />
  );
}
