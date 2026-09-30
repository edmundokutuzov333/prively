# Technical Debt

Updated: 2026-09-30

## B2 migration

Status: DEFERRED / SCRIPT REMOVED FROM MAIN

The B2 originals core is accepted as REAL FLAG. Migration tooling is not kept in main because there are currently no production media rows requiring migration.

## B2 error mapping refinement

Status: IMPLEMENTED

B2 authentication failures are distinguished from transient provider/network failures. Expired presigned URLs are treated as source URL expiry and regenerated instead of being misclassified as Streamtape authentication errors.

## Streamtape delivery

Status: IMPLEMENTED / CERTIFIED

Production path:

B2 private origin -> one-hour presigned read URL -> Streamtape Remote Upload -> pg_cron polling -> Streamtape file id -> authorized embed.

Production deployment currently active:
- streamtape-remote-upload v11
- streamtape-check-status v11
- get-video-playback-url v11

The integration has real historical Streamtape evidence and three persisted ready media assets.

Fresh production evidence is complete. The real Streamtape cycle returned upload id JmHFRUW8sgg and file id jPdlkaWBrlizlDk. Authorized playback returned HTTP 200, subscription denial returned HTTP 403, pending-KYC denial returned HTTP 403, the provider embed returned HTTP 200, and playback was audited.

## Media processing dependency

Status: RESOLVED

The Streamtape Remote Upload contract intentionally requires:

- processing_status=ready
- integrity_status=verified
- moderation_status=clean
- scan_status=clean

The Streamtape video path now uses the final integrity, moderation and scan state as its canonical readiness contract. Optional derivative jobs do not block Streamtape delivery after the final video safety state is approved.

## GitHub evidence runner

Status: REMOVED

A provisional GitHub Actions runner was created during certification, but the repository environment does not currently expose the required Supabase management/database credentials. It was removed instead of committing a known-failing workflow.

The deployment itself was performed directly through the connected Supabase deployment interface, and the three functions are active at version 11.

## Closure

Do not create `fase-streamtape-concluida` until the fresh Streamtape cycle, playback authorization tests, current CI, and cleanup/retention decision are all green.
