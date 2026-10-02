import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function ForbiddenContent() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.forbiddenContent.title")}
      description={t("public.forbiddenContent.description")}
      emptyState={{ message: t("public.forbiddenContent.empty"), action: null }}
    />
  );
}
