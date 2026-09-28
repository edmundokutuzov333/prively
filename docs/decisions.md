# Prively decisions

## Phase 1

### 2026-09-28: Interface Kernel before full backend
The project is being built in a custom ten-phase execution sequence. Phase 1 establishes the reusable production frontend kernel and design system before the domain backends are introduced in later phases.

This does not make the interface a prototype. Components, routing, i18n, validation, PWA configuration, accessibility primitives and the Supabase authentication client are production code. Capabilities that require backend authority are not exposed as completed product features until their backend phases are implemented.

### 2026-09-28: Fail closed when Supabase is not configured
Authentication never falls back to local or simulated success. If the environment does not provide the real Supabase URL and anonymous key, the auth UI reports a configuration error and performs no fake sign-in or registration.

### 2026-09-28: Development-only design system route
The component inventory is available at /system only in development builds. It is not a production user-facing feature and is therefore not exposed in production routing.

## Phase 2

### 2026-09-28: Complete client and creator route surface before domain backends
Phase 2 establishes the full client and creator information architecture, responsive workspace shells, route contracts, real Supabase session awareness, i18n coverage and honest empty/error states.

No creator, purchase, wallet, message, live or catalogue records are invented to populate the screens. Domain data is introduced only when its backend authority exists.

### 2026-09-28: Development-only experience until backend authority exists
The Phase 2 experience routes are enabled in development, but the feature flag remains disabled in production until the corresponding backend domains are implemented and tested. This prevents incomplete product capabilities from being exposed as finished functionality.

### 2026-09-28: Financial surfaces never display fabricated balances
Wallet and earnings surfaces show an explicit unavailable state rather than a zero or sample amount until the real ledger-backed data source is connected.
