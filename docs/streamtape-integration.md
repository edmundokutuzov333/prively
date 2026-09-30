# Streamtape Video Delivery

Updated: 2026-09-30

## Architecture

Original video remains private in Backblaze B2. Streamtape is the delivery provider.

1. Creator uploads to B2.
2. streamtape-remote-upload authorizes the creator, verifies readiness and signs a B2 read URL for one hour.
3. Streamtape fetches the video directly through Remote Upload. Prively stores the upload id and marks the asset processing.
4. pg_cron runs every two minutes through pg_net and calls streamtape-check-status using a Vault-only internal token.
5. Completed uploads are confirmed through file/info; the Streamtape file id is persisted and status becomes ready.
6. get-video-playback-url evaluates the existing authorization chain before returning https://streamtape.com/e/{file_id}.
7. The frontend renders the provider URL in an iframe. Direct B2 video delivery through get-media-url is blocked.

## Error contract

| Condition | Code | Retry |
|---|---|---|
| Streamtape unavailable, timeout, 429/509/5xx | streamtape_unavailable | Yes |
| Invalid Streamtape credentials | streamtape_auth_error | No |
| Expired B2 presigned URL | b2_url_expired | Yes, regenerate |
| Provider rejects source/file | streamtape_rejected | No |
| Remote upload failed | streamtape_upload_failed | Once |

## Security

The remote-upload function is creator-owner only. Playback delegates authorization to get_media_access(), which reaches can_view_post() and enforces approved KYC, age verification, visibility/subscription, blocks and media readiness before any embed URL is returned. Successful playback is audited with streamtape_embed. No provider credentials are stored in source code.

## Scheduling

public.poll_streamtape_uploads() is protected by an advisory transaction lock, reads the internal token from Vault, and polls at most 25 assets per run.

## Production deployment

The production Edge Functions are deployed and the final closure deployment is still gated on CI and live evidence. Before this closure change, the deployed versions were v10 for all three functions. The exact post-merge version numbers and SHA-256 values must be recorded from `supabase functions deploy` output rather than estimated.

## Real evidence

A real B2 -> Streamtape Remote Upload and status cycle has already completed on production:

```json
{ "upload_id": "QIwuotwSWYk", "remote_http": 200, "remote_status": "processing", "status_http": 200, "status": "ready", "file_id": "eGW8vZB2PoTmk0" }
```

Production `media_assets` currently contains three real Streamtape-ready synthetic evidence rows, including persisted upload/file identifiers. The polling cron is installed at two-minute cadence and recent cron runs report `succeeded`.

Real provider embed probes against `https://streamtape.com/e/l4Ggw0BJbzhZYr` returned HTTP 200 with non-empty HTML in GitHub Actions runs 1 and 2. A later probe against the same historical file id returned 404, so that failed probe is not treated as current availability evidence.

The frontend now routes every B2-backed video through `get-video-playback-url` and renders the returned provider URL as an iframe. Direct B2 video delivery through `get-media-url` remains blocked.

## Closure gate

The `fase-streamtape-concluida` tag is intentionally absent. Final closure still requires one fresh end-to-end synthetic B2 upload followed by Remote Upload and polling, fresh authorized playback HTTP 200, fresh unauthorised/KYC/subscription HTTP 403 evidence, current CI green, and cleanup or explicit retention of the synthetic evidence fixtures.
