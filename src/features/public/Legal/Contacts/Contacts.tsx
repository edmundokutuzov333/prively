import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

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
