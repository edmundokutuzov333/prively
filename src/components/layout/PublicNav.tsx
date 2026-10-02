import { SignIn, UserPlus } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/lib/routes";

export function PublicNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("nav.home")} className="flex items-center gap-2">
      <Link to={ROUTES.LOGIN} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-bone-300 hover:bg-ink-900 hover:text-bone-50">
        <SignIn size={18} weight="duotone" />
        {t("nav.enter")}
      </Link>
      <Link to={ROUTES.BECOME_CREATOR} className="flex min-h-11 items-center gap-2 rounded-xl border border-bone-50/10 px-3 text-sm text-bone-50 hover:bg-ink-900">
        <UserPlus size={18} weight="duotone" />
        {t("nav.creator")}
      </Link>
    </nav>
  );
}

export default PublicNav;