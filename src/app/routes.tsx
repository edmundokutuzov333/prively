import { lazy, Suspense } from "react";
import { Navigate, Outlet, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PublicNav } from "@/components/layout/PublicNav";
import { ROUTES } from "@/lib/routes";
import { readAgeVerification } from "@/lib/ageGate";
import { useAuth } from "@/app/session";
import { ExperienceGuard } from "@/app/ExperienceGuards";

const BecomeCreator = lazy(() => import("@/features/public/BecomeCreator"));
const AgeGate = lazy(() => import("@/features/auth/AgeGate"));
const Register = lazy(() => import("@/features/auth/Register"));
const Login = lazy(() => import("@/features/auth/Login"));
const Recover = lazy(() => import("@/features/auth/Recover"));
const Verification = lazy(() => import("@/features/auth/Verification"));
const OnboardingClient = lazy(() => import("@/features/auth/OnboardingClient"));
const OnboardingCreator = lazy(() => import("@/features/auth/OnboardingCreator"));
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


function ProtectedAgeGate() {
  const location = window.location.pathname;
  if (!readAgeVerification()) return <Navigate to={ROUTES.AGE_GATE} replace state={{ from: location }} />;
  return <Outlet />;
}

function AuthenticatedFeatureGuard() {
  const { user, loading } = useAuth();
  if (loading) return <FeatureSuspense />;
  return user ? <Outlet /> : <Navigate to={ROUTES.LOGIN} replace />;
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

const AUTH_ROUTES: RouteObject[] = [
  { element: <ProtectedAgeGate />, children: [
    { path: ROUTES.REGISTER, element: lazyElement(Register) },
    { element: <AuthenticatedFeatureGuard />, children: [
      { path: ROUTES.ONBOARDING_CLIENT, element: lazyElement(OnboardingClient) },
      { element: <ExperienceGuard />, children: [
        { path: ROUTES.ONBOARDING_CREATOR, element: lazyElement(OnboardingCreator) },
      ]},
    ]},
  ]},
  { path: ROUTES.VERIFICATION, element: lazyElement(Verification) },
  { path: ROUTES.AGE_GATE, element: lazyElement(AgeGate) },
  { path: ROUTES.LOGIN, element: lazyElement(Login) },
  { path: ROUTES.RECOVER, element: lazyElement(Recover) },
];

const FEATURE_ROUTES: RouteObject[] = [...PUBLIC_ROUTES, ...AUTH_ROUTES];

export function FeatureRouteResolver() {
  return useRoutes(FEATURE_ROUTES) ?? <Navigate to="/404" replace />;
}

export { FEATURE_ROUTES };
