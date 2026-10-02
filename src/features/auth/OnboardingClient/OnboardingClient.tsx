import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function OnboardingClient() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.onboardingClient.title")} description={t("authPages.onboardingClient.description")} emptyState={{ message: t("authPages.onboardingClient.empty"), action: null }} />;
}
