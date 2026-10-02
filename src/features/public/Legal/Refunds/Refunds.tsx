import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

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
