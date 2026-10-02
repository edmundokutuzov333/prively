import { ChartLineUp, ChatCircle, FilmStrip, GearSix, House, UserCircle } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/lib/routes";

const items = [
  { key: "studio", to: ROUTES.CREATOR_STUDIO, icon: ChartLineUp },
  { key: "content", to: ROUTES.CREATOR_CONTENT, icon: FilmStrip },
  { key: "messages", to: ROUTES.CREATOR_MESSAGES, icon: ChatCircle },
  { key: "settings", to: ROUTES.CREATOR_SETTINGS, icon: GearSix },
  { key: "profile", to: ROUTES.CREATOR_PROFILE, icon: UserCircle },
  { key: "home", to: ROUTES.HOME, icon: House },
] as const;

export function CreatorNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("experience.workspace.creator")} className="flex flex-wrap gap-2">
      {items.map(({ key, to, icon: Icon }) => (
        <NavLink key={key} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${isActive ? "border-crimson-400/30 bg-wine-900 text-bone-50" : "border-bone-50/8 text-bone-300 hover:bg-ink-900 hover:text-bone-50"}`}>
          <Icon size={18} weight="duotone" />
          <span>{t("experience.nav." + key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default CreatorNav;