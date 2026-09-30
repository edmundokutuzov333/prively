# Technical Debt

Updated: 2026-09-30

## B2 migration

Status: DEFERRED / SCRIPT REMOVED FROM MAIN

The B2 originals core is accepted as REAL FLAG. Migration tooling is not kept in main because there are currently no production media rows requiring migration.

## B2 error mapping refinement

Status: IMPLEMENTED

B2 authentication failures are distinguished from transient provider/network failures. Expired presigned URLs are treated as source URL expiry and regenerated instead of being misclassified as Streamtape authentication errors.

## Streamtape delivery

Status: IMPLEMENTED / FRESH CERTIFICATION BLOCKED

Production path:

B2 private origin -> one-hour presigned read URL -> Streamtape Remote Upload -> pg_cron polling -> Streamtape file id -> authorized embed.

Production deployment currently active:
- streamtape-remote-upload v11
- streamtape-check-status v11
- get-video-playback-url v11

The integration has real historical Streamtape evidence and three persisted ready media assets.

The remaining certification gap is not a provider mock. The current fresh synthetic run reached B2 successfully but was blocked before Remote Upload by the existing media-processing worker. The test asset produced queued archive/HLS jobs and existing `processor_not_configured` failures for moderation/thumbnail. This must be resolved or a documented isolated integration test path must be provided before closure.

## Media processing dependency

Status: OPEN

The Streamtape Remote Upload contract intentionally requires:

- processing_status=ready
- integrity_status=verified
- moderation_status=clean
- scan_status=clean

The current dedicated synthetic asset could be made to satisfy these fields manually only for isolation, but doing so is not accepted as fresh end-to-end evidence for the overall Prively media pipeline. A real processor path is still required for final certification.

## GitHub evidence runner

Status: REMOVED

A provisional GitHub Actions runner was created during certification, but the repository environment does not currently expose the required Supabase management/database credentials. It was removed instead of committing a known-failing workflow.

The deployment itself was performed directly through the connected Supabase deployment interface, and the three functions are active at version 11.

## Closure

Do not create `fase-streamtape-concluida` until the fresh Streamtape cycle, playback authorization tests, current CI, and cleanup/retention decision are all green.
