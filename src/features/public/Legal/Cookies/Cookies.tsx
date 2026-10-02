import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

export default function Cookies() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.cookies.title")}
      description={t("public.cookies.description")}
      emptyState={{ message: t("public.cookies.empty"), action: null }}
    />
  );
}
