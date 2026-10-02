import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

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
