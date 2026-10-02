import { lazy, Suspense } from "react";
import { Navigate, Outlet, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { PublicNav } from "@/components/layout/PublicNav";
import { ROUTES } from "@/lib/routes";
import { readAgeVerification } from "@/lib/ageGate";
import { useAuth } from "@/app/session";
import { ExperienceGuard } from "@/app/ExperienceGuards";
import { ClientNav } from "@/components/layout/ClientNav";
import { CreatorNav } from "@/components/layout/CreatorNav";
import { AdminNav } from "@/components/layout/AdminNav";
import { AdminGuard } from "@/app/AdminGuard";

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
const Feed = lazy(() => import("@/features/client/Feed"));
const Discover = lazy(() => import("@/features/client/Discover"));
const CreatorProfile = lazy(() => import("@/features/client/CreatorProfile"));
const Subscribe = lazy(() => import("@/features/client/Subscribe"));
const PpvPurchase = lazy(() => import("@/features/client/PpvPurchase"));
const Wallet = lazy(() => import("@/features/client/Wallet"));
const Purchases = lazy(() => import("@/features/client/Purchases"));
const Wishlist = lazy(() => import("@/features/client/Wishlist"));
const Messages = lazy(() => import("@/features/client/Messages"));
const Conversation = lazy(() => import("@/features/client/Conversation"));
const Notifications = lazy(() => import("@/features/client/Notifications"));
const Encounters = lazy(() => import("@/features/client/Encounters"));
const Account = lazy(() => import("@/features/client/Account"));
const Security = lazy(() => import("@/features/client/Security"));
const Wellbeing = lazy(() => import("@/features/client/Wellbeing"));
const Discreet = lazy(() => import("@/features/client/Discreet"));
const Loyalty = lazy(() => import("@/features/client/Loyalty"));
const CustomRequests = lazy(() => import("@/features/client/CustomRequests"));
const Auctions = lazy(() => import("@/features/client/Auctions"));
const Products = lazy(() => import("@/features/client/Products"));
const Raffles = lazy(() => import("@/features/client/Raffles"));
const Studio = lazy(() => import("@/features/creator/Studio"));
const Wall = lazy(() => import("@/features/creator/Wall"));
const CreateChannel = lazy(() => import("@/features/creator/CreateChannel"));
const Publish = lazy(() => import("@/features/creator/Publish"));
const Store = lazy(() => import("@/features/creator/Store"));
const Subscriptions = lazy(() => import("@/features/creator/Subscriptions"));
const CreatorMessages = lazy(() => import("@/features/creator/Messages"));
const Lives = lazy(() => import("@/features/creator/Lives"));
const Requests = lazy(() => import("@/features/creator/Requests"));
const CreatorAuctions = lazy(() => import("@/features/creator/Auctions"));
const Promotions = lazy(() => import("@/features/creator/Promotions"));
const CreatorRaffles = lazy(() => import("@/features/creator/Raffles"));
const CreatorProducts = lazy(() => import("@/features/creator/Products"));
const Earnings = lazy(() => import("@/features/creator/Earnings"));
const Analytics = lazy(() => import("@/features/creator/Analytics"));
const Fans = lazy(() => import("@/features/creator/Fans"));
const Goals = lazy(() => import("@/features/creator/Goals"));
const Referral = lazy(() => import("@/features/creator/Referral"));
const CreatorEncounters = lazy(() => import("@/features/creator/Encounters"));
const Profile = lazy(() => import("@/features/creator/Profile"));
const CreatorBlocks = lazy(() => import("@/features/creator/Blocks"));
const Emergency = lazy(() => import("@/features/creator/Emergency"));
const SharedSettings = lazy(() => import("@/features/shared/Settings"));
const SharedReceipts = lazy(() => import("@/features/shared/Receipts"));
const SharedReport = lazy(() => import("@/features/shared/Report"));
const SharedBlocks = lazy(() => import("@/features/shared/Blocks"));
const SharedDevices = lazy(() => import("@/features/shared/Devices"));
const SharedNotifications = lazy(() => import("@/features/shared/Notifications"));
const AdminDashboard = lazy(() => import("@/features/admin/Dashboard"));
const AdminUsers = lazy(() => import("@/features/admin/Users"));
const AdminKycQueue = lazy(() => import("@/features/admin/KycQueue"));
const AdminModerationQueue = lazy(() => import("@/features/admin/ModerationQueue"));
const AdminFinance = lazy(() => import("@/features/admin/Finance"));
const AdminCompliance = lazy(() => import("@/features/admin/Compliance"));
const AdminConfig = lazy(() => import("@/features/admin/Config"));
const AdminSupport = lazy(() => import("@/features/admin/Support"));
const AdminStorage = lazy(() => import("@/features/admin/Storage"));
const AdminProductionGate = lazy(() => import("@/features/admin/ProductionGate"));
const SystemNotFound = lazy(() => import("@/features/system/NotFound"));
const SystemForbidden = lazy(() => import("@/features/system/Forbidden"));
const SystemOffline = lazy(() => import("@/features/system/Offline"));

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

function ClientLayout() { return <div className="space-y-6"><ClientNav /><Outlet /></div>; }

function CreatorLayout() { return <div className="space-y-6"><CreatorNav /><Outlet /></div>; }

function SharedLayout() { return <div className="space-y-6"><Outlet /></div>; }
function AdminFeatureLayout() { return <div className="space-y-6"><AdminNav /><Outlet /></div>; }

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

const CLIENT_ROUTES: RouteObject[] = [{ element: <ExperienceGuard />, children: [{ element: <ClientLayout />, children: [
        { path: ROUTES.FEED, element: lazyElement(Feed) },
        { path: ROUTES.DISCOVER, element: lazyElement(Discover) },
        { path: ROUTES.CLIENT_CREATOR_PROFILE_PATTERN, element: lazyElement(CreatorProfile) },
        { path: ROUTES.SUBSCRIBE_PATTERN, element: lazyElement(Subscribe) },
        { path: ROUTES.PPV_PATTERN, element: lazyElement(PpvPurchase) },
        { path: ROUTES.WALLET, element: lazyElement(Wallet) },
        { path: ROUTES.PURCHASES, element: lazyElement(Purchases) },
        { path: ROUTES.WISHLIST, element: lazyElement(Wishlist) },
        { path: ROUTES.MESSAGES, element: lazyElement(Messages) },
        { path: ROUTES.CONVERSATION_PATTERN, element: lazyElement(Conversation) },
        { path: ROUTES.NOTIFICATIONS, element: lazyElement(Notifications) },
        { path: ROUTES.ENCOUNTERS, element: lazyElement(Encounters) },
        { path: ROUTES.ACCOUNT, element: lazyElement(Account) },
        { path: ROUTES.CLIENT_SECURITY, element: lazyElement(Security) },
        { path: ROUTES.CLIENT_WELLBEING, element: lazyElement(Wellbeing) },
        { path: ROUTES.CLIENT_DISCREET, element: lazyElement(Discreet) },
        { path: ROUTES.CLIENT_LOYALTY, element: lazyElement(Loyalty) },
        { path: ROUTES.CLIENT_CUSTOM_REQUESTS, element: lazyElement(CustomRequests) },
        { path: ROUTES.CLIENT_AUCTIONS, element: lazyElement(Auctions) },
        { path: ROUTES.CLIENT_PRODUCTS, element: lazyElement(Products) },
        { path: ROUTES.CLIENT_RAFFLES, element: lazyElement(Raffles) },
] }] }];

const CREATOR_ROUTES: RouteObject[] = [{
  element: <ExperienceGuard />,
  children: [{
    element: <CreatorLayout />,
    children: [
        { path: ROUTES.CREATOR_STUDIO, element: lazyElement(Studio) },
        { path: ROUTES.CREATOR_CONTENT, element: lazyElement(Wall) },
        { path: ROUTES.CREATOR_CREATE_CHANNEL, element: lazyElement(CreateChannel) },
        { path: ROUTES.CREATOR_PUBLISH, element: lazyElement(Publish) },
        { path: ROUTES.CREATOR_STORE, element: lazyElement(Store) },
        { path: ROUTES.CREATOR_SUBSCRIPTIONS, element: lazyElement(Subscriptions) },
        { path: ROUTES.CREATOR_MESSAGES, element: lazyElement(CreatorMessages) },
        { path: ROUTES.CREATOR_LIVES, element: lazyElement(Lives) },
        { path: ROUTES.CREATOR_REQUESTS, element: lazyElement(Requests) },
        { path: ROUTES.CREATOR_AUCTIONS, element: lazyElement(CreatorAuctions) },
        { path: ROUTES.CREATOR_PROMOTIONS, element: lazyElement(Promotions) },
        { path: ROUTES.CREATOR_RAFFLES, element: lazyElement(CreatorRaffles) },
        { path: ROUTES.CREATOR_PRODUCTS, element: lazyElement(CreatorProducts) },
        { path: ROUTES.CREATOR_EARNINGS, element: lazyElement(Earnings) },
        { path: ROUTES.CREATOR_ANALYTICS, element: lazyElement(Analytics) },
        { path: ROUTES.CREATOR_FANS, element: lazyElement(Fans) },
        { path: ROUTES.CREATOR_GOALS, element: lazyElement(Goals) },
        { path: ROUTES.CREATOR_REFERRAL, element: lazyElement(Referral) },
        { path: ROUTES.CREATOR_ENCOUNTERS, element: lazyElement(CreatorEncounters) },
        { path: ROUTES.CREATOR_PROFILE, element: lazyElement(Profile) },
        { path: ROUTES.CREATOR_BLOCKS, element: lazyElement(CreatorBlocks) },
        { path: ROUTES.CREATOR_EMERGENCY, element: lazyElement(Emergency) },
    ],
  }],
}];

const SHARED_ROUTES: RouteObject[] = [{
  element: <AuthenticatedFeatureGuard />,
  children: [{ element: <SharedLayout />, children: [
        { path: ROUTES.SETTINGS, element: lazyElement(SharedSettings) },
        { path: ROUTES.RECEIPTS, element: lazyElement(SharedReceipts) },
        { path: ROUTES.REPORT, element: lazyElement(SharedReport) },
        { path: ROUTES.BLOCKS, element: lazyElement(SharedBlocks) },
        { path: ROUTES.DEVICES, element: lazyElement(SharedDevices) },
        { path: ROUTES.NOTIFICATIONS, element: lazyElement(SharedNotifications) },
  ] }],
}];

const ADMIN_ROUTES: RouteObject[] = [{
  element: <AdminGuard />,
  children: [{
    element: <AdminFeatureLayout />,
    children: [
        { path: ROUTES.ADMIN, element: lazyElement(AdminDashboard) },
        { path: ROUTES.ADMIN_USERS, element: lazyElement(AdminUsers) },
        { path: ROUTES.ADMIN_KYC, element: lazyElement(AdminKycQueue) },
        { path: ROUTES.ADMIN_MODERATION, element: lazyElement(AdminModerationQueue) },
        { path: ROUTES.ADMIN_FINANCE, element: lazyElement(AdminFinance) },
        { path: ROUTES.ADMIN_COMPLIANCE, element: lazyElement(AdminCompliance) },
        { path: ROUTES.ADMIN_CONFIGURATION, element: lazyElement(AdminConfig) },
        { path: ROUTES.ADMIN_SUPPORT, element: lazyElement(AdminSupport) },
        { path: ROUTES.ADMIN_STORAGE, element: lazyElement(AdminStorage) },
        { path: ROUTES.ADMIN_PRODUCTION, element: lazyElement(AdminProductionGate) },
    ],
  }],
}];

const SYSTEM_ROUTES: RouteObject[] = [
  { path: ROUTES.FORBIDDEN, element: lazyElement(SystemForbidden) },
  { path: ROUTES.OFFLINE, element: lazyElement(SystemOffline) },
  { path: ROUTES.NOT_FOUND, element: lazyElement(SystemNotFound) },
];

const FEATURE_ROUTES: RouteObject[] = [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...CLIENT_ROUTES, ...CREATOR_ROUTES, ...SHARED_ROUTES, ...ADMIN_ROUTES, ...SYSTEM_ROUTES];

export function FeatureRouteResolver() {
  return useRoutes(FEATURE_ROUTES) ?? <Navigate to="/404" replace />;
}

export { FEATURE_ROUTES };
