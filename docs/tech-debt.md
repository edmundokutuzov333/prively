# Technical Debt — B2 Media Migration

Updated: 2026-09-30

## Open items

### 1. Node migration verification is not yet certified
Status: OPEN

The migration script has previously only been exercised through an Edge Runtime harness, and that harness failed before the exact Node migration body completed.

Required closure:
- execute `scripts/migrate-storage-to-b2.mjs` in a normal Node 24 environment;
- use 3 synthetic images and 3 synthetic videos;
- verify source-to-B2 byte equality and SHA-256 values;
- verify B2 Content-Type and object size;
- verify `media_assets.storage_provider`, the canonical B2 key, and migration metadata;
- clean up all synthetic source and B2 objects;
- retain the real runner output as evidence.

### 2. B2 error mapping refinement
Status: IMPLEMENTED, pending CI verification

`B2AuthError` is now used for HTTP 401/403 and credential/authentication error codes including `InvalidAccessKeyId`, `AccessDenied`, `SignatureDoesNotMatch`, `InvalidToken`, `ExpiredToken` and related credential failures.

`B2UnavailableError` is restricted to transient service/transport conditions such as HTTP 429/5xx, timeouts and network failures.

Retry behavior:
- `b2_auth_error`: no retry;
- `b2_unavailable`: retry allowed;
- `b2_object_not_found`: HTTP 404, no retry.

### 3. Node migration dependency declaration
Status: OPEN

The migration script uses `@aws-sdk/client-s3` through a dynamic Node import. The repository package manifest/lockfile still needs the dependency to be declared explicitly and verified with `npm ci`.

A temporary Node verification workflow installs the SDK only for the test run and produces an updated dependency artifact. The artifact must be applied to `package.json` and `package-lock.json` after successful verification.

### 4. Temporary B2 verification workflow
Status: TEMPORARY

`.github/workflows/b2-node-migration-verification.yml` exists only to run the migration in normal Node 24 and capture evidence.

It must be removed from `main` after the test completes.

## Completion gate

B2 migration must not be tagged `fase-b2-concluida` until:
1. CI is green;
2. the exact migration script passes in normal Node 24 with six synthetic assets;
3. bytes, hashes, B2 metadata and database metadata are verified;
4. the verification fixtures are fully cleaned up;
5. the Node dependency declaration is committed and CI remains green.
