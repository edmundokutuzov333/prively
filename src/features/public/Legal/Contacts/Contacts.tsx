import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";
import { ROUTES } from "@/lib/routes";

export default function Contacts() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("public.contacts.title")}
      description={t("public.contacts.description")}
      emptyState={{ message: t("public.contacts.empty"), action: null }}
    />
  );
}
