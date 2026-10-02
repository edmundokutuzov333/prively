import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function OnboardingCreator() {
  const { t } = useTranslation();
  return <PageShell title={t("authPages.onboardingCreator.title")} description={t("authPages.onboardingCreator.description")} emptyState={{ message: t("authPages.onboardingCreator.empty"), action: null }} />;
}
