import { lazy, Suspense } from "react";
import { Navigate, Outlet, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PublicNav } from "@/components/layout/PublicNav";
import { ROUTES } from "@/lib/routes";

const BecomeCreator = lazy(() => import("@/features/public/BecomeCreator"));
const Terms = lazy(() => import("@/features/public/Legal/Terms"));
const Privacy = lazy(() => import("@/features/public/Legal/Privacy"));
const ForbiddenContent = lazy(() => import("@/features/public/Legal/ForbiddenContent"));
const Refunds = lazy(() => import("@/features/public/Legal/Refunds"));
const Cookies = lazy(() => import("@/features/public/Legal/Cookies"));
const Dmca = lazy(() => import("@/features/public/Legal/Dmca"));
const Contacts = lazy(() => import("@/features/public/Legal/Contacts"));

function FeatureSuspense() {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-5xl px-5 py-12 text-sm text-bone-500 md:px-8">{t("pageShell.loading")}</div>;
}

function PublicLayout() {
  return <div className="min-h-[calc(100vh-4rem)] bg-ink-950"><div className="mx-auto max-w-7xl px-5 py-4 md:px-8"><PublicNav /></div><div className="px-5 py-8 md:px-8 md:py-12"><Outlet /></div></div>;
}

function lazyElement(Component: React.LazyExoticComponent<React.ComponentType>) {
  return <Suspense fallback={<FeatureSuspense />}><Component /></Suspense>;
}

const PUBLIC_ROUTES: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: ROUTES.BECOME_CREATOR, element: lazyElement(BecomeCreator) },
      { path: ROUTES.LEGAL_TERMS, element: lazyElement(Terms) },
      { path: ROUTES.LEGAL_PRIVACY, element: lazyElement(Privacy) },
      { path: ROUTES.LEGAL_FORBIDDEN_CONTENT, element: lazyElement(ForbiddenContent) },
      { path: ROUTES.LEGAL_REFUNDS, element: lazyElement(Refunds) },
      { path: ROUTES.LEGAL_COOKIES, element: lazyElement(Cookies) },
      { path: ROUTES.LEGAL_DMCA, element: lazyElement(Dmca) },
      { path: ROUTES.LEGAL_CONTACTS, element: lazyElement(Contacts) },
    ],
  },
];

const FEATURE_ROUTES: RouteObject[] = PUBLIC_ROUTES;

export function FeatureRouteResolver() {
  return useRoutes(FEATURE_ROUTES) ?? <Navigate to="/404" replace />;
}

export { FEATURE_ROUTES };
