import { ChatCircle, Compass, GearSix, House, UserCircle, Wallet } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/lib/routes";

const items = [
  { key: "feed", to: ROUTES.FEED, icon: House },
  { key: "discover", to: ROUTES.DISCOVER, icon: Compass },
  { key: "messages", to: ROUTES.MESSAGES, icon: ChatCircle },
  { key: "wallet", to: ROUTES.WALLET, icon: Wallet },
  { key: "account", to: ROUTES.ACCOUNT, icon: UserCircle },
  { key: "settings", to: ROUTES.SETTINGS, icon: GearSix },
] as const;

export function ClientNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("experience.workspace.client")} className="flex flex-wrap gap-2">
      {items.map(({ key, to, icon: Icon }) => (
        <NavLink key={key} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${isActive ? "border-crimson-400/30 bg-wine-900 text-bone-50" : "border-bone-50/8 text-bone-300 hover:bg-ink-900 hover:text-bone-50"}`}>
          <Icon size={18} weight="duotone" />
          <span>{t("experience.nav." + key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default ClientNav;