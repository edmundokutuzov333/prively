import { Bank, GearSix, IdentificationCard, Lifebuoy, ShieldCheck, UsersThree, VideoCamera, WarningCircle } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/lib/routes";

const items = [
  { key: "users", to: ROUTES.ADMIN_USERS, icon: UsersThree },
  { key: "kyc", to: ROUTES.ADMIN_KYC, icon: IdentificationCard },
  { key: "moderation", to: ROUTES.ADMIN_MODERATION, icon: WarningCircle },
  { key: "finance", to: ROUTES.ADMIN_FINANCE, icon: Bank },
  { key: "compliance", to: ROUTES.ADMIN_COMPLIANCE, icon: ShieldCheck },
  { key: "support", to: ROUTES.ADMIN_SUPPORT, icon: Lifebuoy },
  { key: "storage", to: ROUTES.ADMIN_STORAGE, icon: VideoCamera },
  { key: "config", to: ROUTES.ADMIN_CONFIGURATION, icon: GearSix },
] as const;

export function AdminNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("admin.title")} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ key, to, icon: Icon }) => (
        <NavLink key={key} to={to} className={({ isActive }) => `flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${isActive ? "border-crimson-400/30 bg-wine-900 text-bone-50" : "border-bone-50/8 text-bone-300 hover:bg-ink-900 hover:text-bone-50"}`}>
          <Icon size={18} weight="duotone" />
          <span>{t("admin.areas." + key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default AdminNav;