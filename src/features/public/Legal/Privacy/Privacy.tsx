import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

export default function Privacy() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.privacy.title")}
      description={t("public.privacy.description")}
      emptyState={{ message: t("public.privacy.empty"), action: null }}
    />
  );
}
