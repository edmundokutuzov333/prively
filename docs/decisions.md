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

## Phase 3

### 2026-09-28: Server is the financial authority
All monetized actions are routed through PostgreSQL functions with idempotency, spend limits, escrow where applicable, commission calculation and append-only ledger records. Browser state never decides the final amount or beneficiary.

### 2026-09-28: Ledger is append-only
Ledger rows cannot be updated or deleted. Releases and refunds are represented by new balanced transactions, with deferred transaction-balance enforcement and a daily reconciliation job.

### 2026-09-28: Escrow before delivery-dependent release
Custom requests, auctions and products use escrow records. Funds are released only through server-controlled transitions, while refunds create compensating ledger records.

### 2026-09-28: Private media is not publicly addressable
Media metadata lives in PostgreSQL while binary content remains in a private Supabase Storage bucket. Access is authorized by a database function and delivered as a short-lived signed URL by an Edge Function.

### 2026-09-28: LiveKit credentials are server-issued
LiveKit room access is granted by an authenticated Edge Function after the database authorization function approves the session. API credentials and signing secrets never enter the browser.

### 2026-09-28: Engagement rewards remain configurable
Points, missions, levels and badges have persistent schema and server functions, but no reward schedule is enabled by default. This prevents an unreviewed monetary or behavioural incentive policy from silently becoming active.

### 2026-09-28: Referral payout is disabled until configured
Referral code infrastructure exists, but referral percentage and activation window are zero and disabled by default. The financial engine therefore cannot accidentally distribute an unapproved commission share.


## Phase 4

### 2026-09-28: Server-side permission model
Roles are mapped to explicit permissions in `public.role_permissions`. Administrative permissions require an AAL2-authenticated session. The frontend never becomes the authority for access decisions.

### 2026-09-28: Authentication and identity records
Signup records age-gate and legal acceptance through authenticated RPCs. Sessions, trusted devices, account-state transitions, self-exclusion and security events are persisted in PostgreSQL. Recovery uses Supabase Auth OTP rather than a local password reset mechanism.

### 2026-09-28: KYC documents remain private
Identity documents and selfies are stored in the private `prively-kyc` bucket. Clients can submit their own files, but direct read access is not granted. Authorised KYC administrators receive short-lived signed URLs for review.

### 2026-09-28: Admin Control Room requires MFA
The /admin control room is not reachable solely by possessing the admin role. A verified TOTP factor and AAL2 session are required before the server-side admin policies allow the sensitive operations.

### 2026-09-28: SECURITY DEFINER execution is allowlisted
PostgREST execution of SECURITY DEFINER routines is revoked by default from PUBLIC. Only explicitly approved authenticated RPCs and RLS helper functions are granted back to the client role. Internal ledger, reconciliation and helper routines remain unavailable as direct RPCs.

### 2026-09-28: Deployment observability limitation
The Vercel deployment integration currently reports failed deployments for the Prively project, but the connected Vercel tool does not expose the corresponding build logs/project to this session. Phase 4 therefore is not marked production-deploy-verified until that external deployment failure can be inspected.


## Phase 5

### 2026-09-28: Content is server-authorized
Posts are only visible through RLS and `can_view_post()`. The visibility gate also requires every attached media asset to have verified integrity and a clean moderation/scan state before a client can access the post.

### 2026-09-28: Uploads are private and resumable
Creator uploads use Supabase Storage resumable TUS uploads with signed upload URLs. The browser never receives a public storage URL. Upload metadata, expected SHA-256, size and expiry are stored server-side before bytes are accepted.

### 2026-09-28: Integrity is verified from the stored object
A media job re-reads the private object and computes SHA-256 server-side. A mismatch marks the asset as failed and flagged, preventing publication.

### 2026-09-28: Media processing uses explicit adapters
Thumbnail generation, HLS transcoding, watermark baking and provider-backed moderation are represented as durable media jobs. External processing is only executed when the corresponding endpoint and credentials are configured. No fake provider or simulated clean result is used.

### 2026-09-28: BlurHash is generated before upload
Image posts calculate a compact BlurHash placeholder from the selected image before the post is created. The hash is persisted with the post and can be used by future feed/detail surfaces for progressive rendering.

### 2026-09-28: Access is audited
Every signed-media authorization attempt is persisted in `media_access_logs`. Compliance/archive events preserve post and asset context without making the private media bucket public.

### 2026-09-28: Moderation stays fail-closed
A post cannot become client-visible while its attached media is pending, mismatched, flagged, under review or otherwise not clean. Processing jobs can remain blocked when a real processor has not been configured.

### 2026-09-28: Deployment caveat remains explicit
Supabase production migrations and the Phase 5 Edge Functions are deployed and active. GitHub Actions is running the main CI pipeline, but the Vercel integration continues to report an external deployment/build-rate-limit failure and is not treated as a successful production verification.
