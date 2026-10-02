import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function OnboardingClient() {
  const { t } = useTranslation();
  const steps = [1, 2, 3, 4] as const;
  return (
    <PageShell
      title={t("authPages.onboardingClient.title")}
      description={t("authPages.onboardingClient.description")}
      emptyState={{
        message: t("authPages.onboardingClient.empty"),
        action: (
          <ol className="grid gap-3 text-sm leading-6 text-bone-300">
            {steps.map((step) => <li key={step} className="rounded-xl border border-bone-50/8 bg-ink-950/40 px-4 py-3">{step}. {t(`authPages.onboardingClient.step${step}`)}</li>)}
          </ol>
        ),
      }}
    />
  );
}
