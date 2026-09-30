# Technical Debt — B2 Media Migration

Updated: 2026-09-30

## Open items

### 1. B2 migration is pending by design
Status: DEFERRED / SCRIPT REMOVED FROM MAIN

The B2 originals core is accepted as `REAL·FLAG`. There are currently no production media rows requiring migration, so the migration script is intentionally not kept in `main`.

The migration was not certified because a normal Node 24 execution against the real Supabase Storage and B2 credentials could not be completed. The GitHub Actions verification run stopped before migration because `SUPABASE_SERVICE_ROLE_KEY`, `B2_KEY_ID` and `B2_APPLICATION_KEY` were not available there. The product decision is not to expose the Supabase `SERVICE_ROLE_KEY` to GitHub Actions without a present migration need.

Required closure when migration becomes necessary:
- execute `scripts/migrate-storage-to-b2.mjs` in a normal Node 24 environment;
- use 3 synthetic images and 3 synthetic videos;
- verify source-to-B2 byte equality and SHA-256 values;
- verify B2 Content-Type and object size;
- verify `media_assets.storage_provider`, the canonical B2 key, and migration metadata;
- clean up all synthetic source and B2 objects;
- retain the real runner output as evidence.

### 2. B2 error mapping refinement
Status: IMPLEMENTED

`B2AuthError` is now used for HTTP 401/403 and credential/authentication error codes including `InvalidAccessKeyId`, `AccessDenied`, `SignatureDoesNotMatch`, `InvalidToken`, `ExpiredToken` and related credential failures.

`B2UnavailableError` is restricted to transient service/transport conditions such as HTTP 429/5xx, timeouts and network failures.

Retry behavior:
- `b2_auth_error`: no retry;
- `b2_unavailable`: retry allowed;
- `b2_object_not_found`: HTTP 404, no retry.

### 3. Node migration dependency declaration
Status: DEFERRED WITH MIGRATION

The migration script uses `@aws-sdk/client-s3` through a dynamic Node import. The repository package manifest/lockfile still needs the dependency to be declared explicitly and verified with `npm ci`.

The repository will need the explicit Node S3 dependency only when the migration script is reinstated for an actual migration.

### 4. Temporary B2 verification workflow
Status: REMOVED

The temporary verification workflow was removed after the credential gate failed. It will not be recreated while there is no migration need.

## Completion gate

B2 migration must not be tagged `fase-b2-concluida` until:
1. CI is green;
2. the exact migration script passes in normal Node 24 with six synthetic assets;
3. bytes, hashes, B2 metadata and database metadata are verified;
4. the verification fixtures are fully cleaned up;
5. the Node dependency declaration is committed and CI remains green.

## Streamtape video delivery

Status: IMPLEMENTED / REAL SERVICE EVIDENCE IN PROGRESS

Production path: B2 originals -> one-hour B2 read URL -> Streamtape Remote Upload -> pg_cron status polling -> Streamtape file id -> authorized embed.

Closure gate before the fase-streamtape-concluida tag:
1. Real Remote Upload and status reach ready.
2. KYC and subscription authorization are enforced before playback.
3. Authorized playback is audited in media_access_logs.
4. Legacy B2 video delivery is blocked.
5. CI is green.
6. Real Streamtape embed curl returns HTTP 200.
7. Synthetic B2, Streamtape and database fixtures are cleaned.
