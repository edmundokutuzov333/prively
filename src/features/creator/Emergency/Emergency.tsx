import { useTranslation } from "@/lib/i18n";
import { PageShell } from "@/components/layout/PageShell";

export default function Emergency() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t("creator.emergency.title")}
      description={t("creator.emergency.description")}
      emptyState={{
        message: t("creator.emergency.empty"),
        action: (
          <button
            type="button"
            disabled
            title={t("creator.emergency.disabledReason")}
            className="inline-flex min-h-11 cursor-not-allowed items-center rounded-xl border border-bone-50/10 px-4 text-sm font-semibold text-bone-500 opacity-70"
          >
            {t("creator.emergency.cta")}
          </button>
        ),
      }}
    />
  );
}
