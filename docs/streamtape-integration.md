# Streamtape Video Delivery

Updated: 2026-09-30

## Scope

Streamtape is the Prively video hosting and delivery provider. Backblaze B2 remains the private origin for original media.

## Production architecture

1. Creator uploads the original video to private Backblaze B2.
2. `streamtape-remote-upload` authenticates the creator, verifies ownership and media readiness, and generates a one-hour B2 read URL.
3. Streamtape Remote Upload fetches the file directly from B2. Prively persists the returned Streamtape upload id and marks the asset as processing.
4. `public.poll_streamtape_uploads()` runs every two minutes through pg_cron and calls `streamtape-check-status` using a Vault-only internal token.
5. When Streamtape reports completed, Prively confirms the file through `/file/info`, persists `streamtape_file_id`, and marks the asset ready.
6. `get-video-playback-url` checks the normal media authorization chain before returning the Streamtape embed URL.
7. The frontend renders only the authorized Streamtape URL in an iframe. Direct B2 video delivery through `get-media-url` remains blocked.

## Streamtape API

Authentication uses query parameters:

`login=STREAMTAPE_API_USERNAME&key=STREAMTAPE_API_PASSWORD`

Remote Upload:

`GET https://api.streamtape.com/remotedl/add`

Status:

`GET https://api.streamtape.com/remotedl/status`

File info:

`GET https://api.streamtape.com/file/info`

Embed:

`https://streamtape.com/e/{file_id}`

Provider credentials are read only from Supabase Secrets. They are not present in source control.

## Edge Functions

### streamtape-remote-upload

Input:

`{ "asset_id": "uuid", "folder_id": "optional" }`

Security contract:
- JWT required.
- Asset must belong to the authenticated creator.
- Asset must be a B2-backed video.
- Media must be processing-ready, integrity-verified, moderation-clean and scan-clean.
- B2 source URL is presigned for one hour.
- Streamtape credentials are loaded from environment secrets.
- Authentication errors are non-retriable.
- Provider availability errors are retriable.
- Repeated remote-upload failure is bounded.
- B2 URL expiry is treated as a source URL failure and is retried with regeneration, not as a Streamtape credential failure.

### streamtape-check-status

Accepts the internal Vault-backed polling token or an authenticated creator request.

Provider states handled:
- `processing`
- `completed`
- `failed`
- `error`

On completion, Prively calls `/file/info` before persisting the final Streamtape file id.

### get-video-playback-url

JWT required.

The permission decision occurs before the embed URL is returned. The existing access layer enforces KYC, subscription or post visibility, blocks and media readiness. Successful access is written to `media_access_logs` with action `streamtape_embed`.

## Retry contract

| Condition | Code | Retry |
|---|---|---|
| Streamtape unavailable, timeout, 429/509/5xx | `streamtape_unavailable` | Yes, bounded backoff |
| Invalid Streamtape credentials | `streamtape_auth_error` | No |
| Expired B2 presigned URL | `b2_url_expired` | Yes, regenerate |
| Provider rejects source/file | `streamtape_rejected` | No |
| Remote upload failed | `streamtape_upload_failed` | At most once more |

## Scheduling

`public.poll_streamtape_uploads()` uses an advisory transaction lock and processes a bounded batch per invocation.

Configured cron:

`*/2 * * * *`

The internal polling token is kept in Supabase Vault.

## Production deployment evidence

The three requested functions are active in production at version 11:

- `streamtape-remote-upload` v11, verify_jwt=true
- `streamtape-check-status` v11, verify_jwt=false because the function implements the additional Vault-backed internal-token check
- `get-video-playback-url` v11, verify_jwt=true

The deployment was performed against the connected production Supabase project. No provider credentials were placed in source.

## Existing real Streamtape evidence

Before this certification pass, Prively already had real Streamtape-ready records:

| Asset | Remote upload id | Streamtape file id | Persisted status |
|---|---|---|---|
| `08bd9c2f-9692-445f-9a58-f9d7481c689c` | `QIwuotwSWYk` | `eGW8vZB2PoTmk0` | ready |
| `b6a351e5-c2e7-4821-802e-37b532161642` | `f5RZOH9Doqg` | `YGRQGe48JVFpb8` | ready |
| `51ac662e-fc3d-4e42-9eda-e3dac7fc938f` | `cLbjn2maAbM` | `l4Ggw0BJbzhZYr` | ready |

Historical real provider evidence recorded in the project also contains a Remote Upload HTTP 200 followed by a completed status and a persisted file id. Historical embed probing recorded a HTTP 200 response for one of the real file ids.

## Fresh certification status on 2026-09-30

The fresh synthetic run reached real B2 upload and created a real `media_assets` fixture:

`d9ba8e09-1975-452a-ba46-e0ea4b47e043`

The fixture was a five-second synthetic MP4 generated with ffmpeg testsrc and uploaded to the real private B2 path:

`users/325946eb-1caa-4bbc-bf91-9948d2dfb4a6/media/d9ba8e09-1975-452a-ba46-e0ea4b47e043.mp4`

The fresh run did not reach Streamtape Remote Upload because the unrelated media worker stalled on queued archive/HLS processing. The media pipeline also exposes existing `processor_not_configured` failures for moderation and thumbnail jobs. The Streamtape integration itself was therefore not marked as freshly certified from this run.

No mock Streamtape response was accepted as evidence.

## Closure gate

`fase-streamtape-concluida` does not exist.

It must remain absent until all of the following are green in one current certification:
1. real B2 synthetic upload;
2. real Streamtape Remote Upload returns an upload id;
3. real polling reaches completed and persists file id;
4. authorized playback returns the embed URL;
5. Streamtape embed probe returns HTTP 200;
6. no-subscription client returns HTTP 403;
7. non-approved KYC client returns HTTP 403;
8. playback audit row exists;
9. CI is green;
10. synthetic fixtures are either deleted or explicitly retained as evidence.
