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

The remote-upload function is creator-owner only. Playback delegates authorization to get_media_access(), which reaches can_view_post() and enforces KYC, visibility/subscription, blocks and media readiness before any embed URL is returned. Successful playback is audited with streamtape_embed. No provider credentials are stored in source code.

## Scheduling

public.poll_streamtape_uploads() is protected by an advisory transaction lock, reads the internal token from Vault, and polls at most 25 assets per run.

## Production deployment

The three production Edge Functions are active with JWT policy preserved:

- `streamtape-remote-upload` v3, SHA `62b29b6742e58c34192e8bf1829edeeb36b4c7bd450b414e1a8446c2db0391d`.
- `streamtape-check-status` v3, SHA `22cb3d7fed3310a50fb6d064a1e42d9f74763ce7cb2493440bef02b3a4db8165`. JWT gateway disabled because it accepts only the Vault-backed internal polling token or an authenticated creator.
- `get-video-playback-url` v3, SHA `198611b74cd48c63d2b371520d2af2529bf4de048f6751eaa6d8461877aea700`.

## Real evidence

A real B2 -> Streamtape Remote Upload and status cycle has already completed:

```json
{ "upload_id": "QIwuotwSWYk", "remote_http": 200, "remote_status": "processing", "status_http": 200, "status": "ready", "file_id": "eGW8vZB2PoTmk0" }
```

Production `media_assets` currently contains three real Streamtape-ready synthetic evidence rows, including persisted upload/file identifiers. The polling cron is installed at two-minute cadence and recent cron runs report `succeeded`.

Real provider embed probes against `https://streamtape.com/e/l4Ggw0BJbzhZYr` returned HTTP 200 with non-empty HTML in GitHub Actions runs 1 and 2. A later probe against the same historical file id returned 404, so that failed probe is not treated as current availability evidence.

The frontend now routes every B2-backed video through `get-video-playback-url` and renders the returned provider URL as an iframe. Direct B2 video delivery through `get-media-url` remains blocked.

## Closure gate

The `fase-streamtape-concluida` tag is intentionally absent. Final closure still requires fresh authorized playback HTTP 200, fresh unauthorized/KYC/subscription HTTP 403 evidence, current CI green, and cleanup or explicit retention of the synthetic evidence fixtures.
