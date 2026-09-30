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

## Real evidence

Real production Remote Upload and status polling have already succeeded against the live B2 bucket and live Streamtape account.

{ "upload_id": "QIwuotwSWYk", "remote_http": 200, "remote_status": "processing", "status_http": 200, "status": "ready", "file_id": "eGW8vZB2PoTmk0" }

A KYC-denied playback request returned HTTP 403 with media_forbidden. A subsequent authorized request reached the audit-log gate; the missing streamtape_embed action was closed by forward-only migration 20260930170000_media_access_logs_streamtape_action.

Closure requires authorized playback HTTP 200, real embed HTTP 200 from curl, green CI, and cleanup of all synthetic fixtures.
