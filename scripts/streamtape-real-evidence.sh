#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"

EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/streamtape}"
mkdir -p "$EVIDENCE_DIR"
VIDEO_FILE="$EVIDENCE_DIR/streamtape-evidence-testsrc.mp4"
FFMPEG_BIN="$(node --input-type=module -e 'import ffmpegPath from "ffmpeg-static"; process.stdout.write(ffmpegPath)')"
[[ -x "$FFMPEG_BIN" ]] || { echo "ffmpeg-static binary is unavailable: $FFMPEG_BIN" >&2; exit 1; }

export PGHOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
export PGPORT="5432"
export PGUSER="postgres"
export PGDATABASE="postgres"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"

sql() {
  SQL_QUERY="$1" node --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const result = await client.query(process.env.SQL_QUERY);
  if (result.rows.length === 0) {
    process.stdout.write("");
  } else if (result.fields.length === 1) {
    for (const row of result.rows) process.stdout.write(String(row[result.fields[0].name] ?? "") + "\\n");
  } else {
    process.stdout.write(JSON.stringify(result.rows));
  }
} finally {
  await client.end();
}
NODE
}

json_request() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local body="${4:-}"
  local header_file
  header_file="$(mktemp)"
  local response
  if [[ -n "$token" ]]; then
    response="$(curl -sS -X "$method" "$url" \
      -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -o "$EVIDENCE_DIR/last-response.json" \
      -D "$header_file" \
      -w '%{http_code}' \
      --data "$body")"
  else
    response="$(curl -sS -X "$method" "$url" \
      -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
      -H "Content-Type: application/json" \
      -o "$EVIDENCE_DIR/last-response.json" \
      -D "$header_file" \
      -w '%{http_code}' \
      --data "$body")"
  fi
  STATUS_CODE="$response"
  BODY="$(cat "$EVIDENCE_DIR/last-response.json")"
  rm -f "$header_file"
}

auth_token() {
  local email="$1"
  local password="$2"
  local response
  response="$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')")"
  local token
  token="$(jq -r '.access_token // empty' <<<"$response")"
  [[ -n "$token" ]] || { echo "Auth failed for test account" >&2; echo "$response" >&2; return 1; }
  printf '%s' "$token"
}

backup_and_set_test_passwords() {
  CREATOR_ID="$(sql "select id from auth.users where email='criadora.teste@prively.test' limit 1;")"
  CLIENT_ID="$(sql "select id from auth.users where email='cliente.teste@prively.test' limit 1;")"
  [[ -n "$CREATOR_ID" && -n "$CLIENT_ID" ]] || { echo "Dedicated Prively test users are missing" >&2; exit 1; }

  OLD_CREATOR_HASH="$(sql "select encrypted_password from auth.users where id='$CREATOR_ID';")"
  OLD_CLIENT_HASH="$(sql "select encrypted_password from auth.users where id='$CLIENT_ID';")"
  [[ -n "$OLD_CREATOR_HASH" && -n "$OLD_CLIENT_HASH" ]] || { echo "Could not read test password hashes" >&2; exit 1; }

  CHANNEL_ID="$(sql "select id from public.channels where owner_id='$CREATOR_ID' order by created_at limit 1;")"
  [[ -n "$CHANNEL_ID" ]] || { echo "Dedicated creator channel is missing" >&2; exit 1; }

  EXISTING_SUB_COUNT="$(sql "select count(*) from public.subscriptions where subscriber_id='$CLIENT_ID' and channel_id='$CHANNEL_ID';")"
  [[ "$EXISTING_SUB_COUNT" == "0" ]] || { echo "Dedicated test client already has a subscription; refusing to mutate existing billing state" >&2; exit 1; }

  OLD_KYC_ID="$(sql "select id from public.kyc_verifications where user_id='$CLIENT_ID' order by created_at desc limit 1;")"
  OLD_KYC_STATUS="$(sql "select status from public.kyc_verifications where id='$OLD_KYC_ID';")"
  [[ -n "$OLD_KYC_ID" && -n "$OLD_KYC_STATUS" ]] || { echo "Dedicated test client KYC row is missing" >&2; exit 1; }

  TEST_PASSWORD="$(openssl rand -hex 24)"
  psql "$PSQL" -Xq <<SQL
update auth.users
set encrypted_password=crypt('$TEST_PASSWORD', gen_salt('bf')),
    updated_at=now()
where id in ('$CREATOR_ID','$CLIENT_ID');
SQL
}

restore_test_account_state() {
  set +e
  if [[ -n "${OLD_CREATOR_HASH:-}" && -n "${CREATOR_ID:-}" ]]; then
    sql "update auth.users set encrypted_password='$OLD_CREATOR_HASH', updated_at=now() where id='$CREATOR_ID';" >/dev/null
  fi
  if [[ -n "${OLD_CLIENT_HASH:-}" && -n "${CLIENT_ID:-}" ]]; then
    sql "update auth.users set encrypted_password='$OLD_CLIENT_HASH', updated_at=now() where id='$CLIENT_ID';" >/dev/null
  fi
  if [[ -n "${OLD_KYC_ID:-}" && -n "${OLD_KYC_STATUS:-}" ]]; then
    sql "update public.kyc_verifications set status='$OLD_KYC_STATUS', reviewed_at=coalesce(reviewed_at,now()) where id='$OLD_KYC_ID';" >/dev/null
  fi
  if [[ -n "${TEST_TIER_ID:-}" && "${TIER_CREATED_BY_TEST:-0}" == "1" ]]; then
    sql "delete from public.subscriptions where channel_id='$CHANNEL_ID' and tier_id='$TEST_TIER_ID';" >/dev/null
    sql "delete from public.subscription_tiers where id='$TEST_TIER_ID';" >/dev/null
  else
    sql "delete from public.subscriptions where subscriber_id='$CLIENT_ID' and channel_id='$CHANNEL_ID';" >/dev/null
  fi
  unset PGPASSWORD
}
trap restore_test_account_state EXIT

write_summary() {
  local name="$1"
  local json="$2"
  jq -S . <<<"$json" > "$EVIDENCE_DIR/$name.json"
  printf '%s\n' "$json"
}

echo "== Streamtape real evidence =="
echo "Project: $SUPABASE_PROJECT_REF"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo
echo "== Deploy 1/3: streamtape-remote-upload =="
supabase functions deploy streamtape-remote-upload --project-ref "$SUPABASE_PROJECT_REF" | tee "$EVIDENCE_DIR/deploy-remote-upload.txt"

echo
echo "== Deploy 2/3: streamtape-check-status =="
supabase functions deploy streamtape-check-status --project-ref "$SUPABASE_PROJECT_REF" | tee "$EVIDENCE_DIR/deploy-check-status.txt"

echo
echo "== Deploy 3/3: get-video-playback-url =="
supabase functions deploy get-video-playback-url --project-ref "$SUPABASE_PROJECT_REF" | tee "$EVIDENCE_DIR/deploy-playback.txt"

backup_and_set_test_passwords

echo
echo "== Test 1: generate 5s ffmpeg fixture =="
"$FFMPEG_BIN" -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc=duration=5:size=320x240:rate=30" \
  -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$VIDEO_FILE"
VIDEO_SIZE="$(stat -c '%s' "$VIDEO_FILE")"
VIDEO_SHA="$(sha256sum "$VIDEO_FILE" | awk '{print $1}')"
echo "video_size=$VIDEO_SIZE"
echo "sha256=$VIDEO_SHA"

CREATOR_TOKEN="$(auth_token 'criadora.teste@prively.test' "$TEST_PASSWORD")"
CLIENT_TOKEN="$(auth_token 'cliente.teste@prively.test' "$TEST_PASSWORD")"

echo
echo "== Prepare creator terms and draft post =="
json_request POST "$SUPABASE_URL/rest/v1/rpc/record_legal_acceptance" "$CREATOR_TOKEN" '{"_document_type":"creator_terms","_version":"1.0","_source":"streamtape-real-evidence"}'
[[ "$STATUS_CODE" == "200" ]] || { echo "$BODY" >&2; exit 1; }
json_request POST "$SUPABASE_URL/rest/v1/rpc/record_legal_acceptance" "$CREATOR_TOKEN" '{"_document_type":"content_prohibited","_version":"1.0","_source":"streamtape-real-evidence"}'
[[ "$STATUS_CODE" == "200" ]] || { echo "$BODY" >&2; exit 1; }

POST_BODY="$(jq -nc --arg channel "$CHANNEL_ID" '{_channel:$channel,_caption:"Streamtape real E2E evidence",_visibility:"subscribers",_min_tier_rank:null,_price:null,_is_story:false,_expires_at:null}')"
json_request POST "$SUPABASE_URL/rest/v1/rpc/create_post" "$CREATOR_TOKEN" "$POST_BODY"
[[ "$STATUS_CODE" == "200" ]] || { echo "$BODY" >&2; exit 1; }
POST_ID="$(jq -r '.' <<<"$BODY")"
POST_ID="${POST_ID//\"/}"
[[ "$POST_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "Invalid post id: $POST_ID" >&2; exit 1; }

echo
echo "== Create B2 upload plan =="
UPLOAD_BODY="$(jq -nc --arg post "$POST_ID" --argjson size "$VIDEO_SIZE" '{postId:$post,kind:"video",mimeType:"video/mp4",fileSize:$size,sha256:null,originalFilename:"streamtape-evidence-testsrc.mp4",participantsConsent:true}')"
json_request POST "$SUPABASE_URL/functions/v1/create-media-upload" "$CREATOR_TOKEN" "$UPLOAD_BODY"
write_summary "test1-create-media-upload" "$BODY"
[[ "$STATUS_CODE" == "200" ]] || exit 1
ASSET_ID="$(jq -r '.assetId' <<<"$BODY")"
UPLOAD_ID="$(jq -r '.uploadId' <<<"$BODY")"
B2_UPLOAD_URL="$(jq -r '.uploadUrl' <<<"$BODY")"
[[ "$ASSET_ID" =~ ^[0-9a-f-]{36}$ && "$UPLOAD_ID" =~ ^[0-9a-f-]{36}$ && "$B2_UPLOAD_URL" == https://* ]] || { echo "Invalid B2 upload plan" >&2; exit 1; }

echo
echo "== Upload fixture to private B2 =="
curl -sS --fail-with-body -X PUT "$B2_UPLOAD_URL" \
  -H 'Content-Type: video/mp4' \
  --upload-file "$VIDEO_FILE" \
  -o "$EVIDENCE_DIR/b2-upload-response.txt"
echo "B2 PUT status=2xx" | tee "$EVIDENCE_DIR/test1-b2-put.txt"

echo
echo "== Finalize B2 upload =="
FINALIZE_BODY="$(jq -nc --arg upload "$UPLOAD_ID" --arg sha "$VIDEO_SHA" --argjson size "$VIDEO_SIZE" '{_upload:$upload,_reported_sha256:$sha,_file_size:$size}')"
json_request POST "$SUPABASE_URL/rest/v1/rpc/finalize_media_upload" "$CREATOR_TOKEN" "$FINALIZE_BODY"
write_summary "test1-finalize" "$BODY"
[[ "$STATUS_CODE" == "200" ]] || exit 1

echo
echo "== Run creator-owned integrity/archive jobs =="
for job_type in integrity archive; do
  JOB_ID="$(sql "select id from public.media_processing_jobs where asset_id='$ASSET_ID' and job_type='$job_type' limit 1;")"
  [[ -n "$JOB_ID" ]] || { echo "Missing $job_type job" >&2; exit 1; }
  json_request POST "$SUPABASE_URL/functions/v1/process-media-job" "$CREATOR_TOKEN" "$(jq -nc --arg job "$JOB_ID" '{jobId:$job}')"
  jq -S . <<<"$BODY" > "$EVIDENCE_DIR/process-$job_type.json"
  [[ "$STATUS_CODE" == "200" || "$STATUS_CODE" == "202" ]] || { echo "$BODY" >&2; exit 1; }
done

echo
echo "== Wait for media processing to become ready =="
for attempt in $(seq 1 60); do
  READINESS="$(sql "select json_build_object('processing_status',processing_status,'integrity_status',integrity_status,'moderation_status',moderation_status,'scan_status',scan_status) from public.media_assets where id='$ASSET_ID';")"
  echo "processing_attempt=$attempt $READINESS"
  if [[ "$(jq -r '.processing_status' <<<"$READINESS")" == "ready" && "$(jq -r '.integrity_status' <<<"$READINESS")" == "verified" && "$(jq -r '.moderation_status' <<<"$READINESS")" == "clean" && "$(jq -r '.scan_status' <<<"$READINESS")" == "clean" ]]; then
    break
  fi
  [[ "$attempt" -lt 60 ]] || { echo "Media did not reach ready state" >&2; exit 1; }
  sleep 10
done

echo
echo "== Test 1: real Streamtape Remote Upload =="
json_request POST "$SUPABASE_URL/functions/v1/streamtape-remote-upload" "$CREATOR_TOKEN" "$(jq -nc --arg asset "$ASSET_ID" '{asset_id:$asset}')"
write_summary "test1-remote-upload" "$BODY"
[[ "$STATUS_CODE" == "200" ]] || exit 1
STREAMTAPE_UPLOAD_ID="$(jq -r '.upload_id' <<<"$BODY")"
[[ -n "$STREAMTAPE_UPLOAD_ID" && "$STREAMTAPE_UPLOAD_ID" != "null" ]] || exit 1

echo
echo "== Test 2: real Streamtape status polling =="
STREAMTAPE_STATUS=""
STREAMTAPE_FILE_ID=""
for attempt in $(seq 1 60); do
  json_request POST "$SUPABASE_URL/functions/v1/streamtape-check-status" "$CREATOR_TOKEN" "$(jq -nc --arg asset "$ASSET_ID" '{asset_id:$asset}')"
  jq -S . <<<"$BODY" > "$EVIDENCE_DIR/status-attempt-$attempt.json"
  echo "status_attempt=$attempt http=$STATUS_CODE body=$BODY"
  if [[ "$STATUS_CODE" == "200" ]]; then
    STREAMTAPE_STATUS="$(jq -r '.status // empty' <<<"$BODY")"
    STREAMTAPE_FILE_ID="$(jq -r '.file_id // empty' <<<"$BODY")"
    [[ "$STREAMTAPE_STATUS" == "ready" && -n "$STREAMTAPE_FILE_ID" ]] && break
  fi
  if [[ "$STATUS_CODE" == "422" || "$STATUS_CODE" == "502" ]]; then
    echo "Provider polling reached terminal error: $BODY" >&2
    exit 1
  fi
  [[ "$attempt" -lt 60 ]] || { echo "Streamtape did not reach ready state" >&2; exit 1; }
  sleep 10
done

write_summary "test2-status-final" "$BODY"

echo
echo "== Publish test post after media readiness =="
json_request POST "$SUPABASE_URL/rest/v1/rpc/publish_post" "$CREATOR_TOKEN" "$(jq -nc --arg post "$POST_ID" '{_post:$post,_scheduled_at:null}')"
[[ "$STATUS_CODE" == "200" ]] || { echo "$BODY" >&2; exit 1; }

echo
echo "== Test 3a: client without subscription must be denied =="
json_request POST "$SUPABASE_URL/functions/v1/get-video-playback-url" "$CLIENT_TOKEN" "$(jq -nc --arg asset "$ASSET_ID" '{asset_id:$asset}')"
write_summary "test3-no-subscription" "$BODY"
[[ "$STATUS_CODE" == "403" ]] || { echo "Expected 403 without subscription, got $STATUS_CODE" >&2; exit 1; }

echo
echo "== Create temporary subscription =="
TIER_CREATED_BY_TEST=0
TEST_TIER_ID="$(sql "select id from public.subscription_tiers where channel_id='$CHANNEL_ID' order by rank limit 1;")"
if [[ -z "$TEST_TIER_ID" ]]; then
  TEST_TIER_ID="$(sql "insert into public.subscription_tiers(channel_id,name,rank,price_month,discounts,early_access) values('$CHANNEL_ID','Bronze',1,100, '{}'::jsonb, false) returning id;")"
  TIER_CREATED_BY_TEST=1
fi
sql "insert into public.subscriptions(id,subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,auto_renew,status,created_at,past_due_at,renewal_attempts) values(gen_random_uuid(),'$CLIENT_ID','$CHANNEL_ID','$TEST_TIER_ID',1,100,now()+interval '1 month',false,'active',now(),null,0);"

echo
echo "== Test 3b: authorized playback =="
json_request POST "$SUPABASE_URL/functions/v1/get-video-playback-url" "$CLIENT_TOKEN" "$(jq -nc --arg asset "$ASSET_ID" '{asset_id:$asset}')"
write_summary "test3-authorized-playback" "$BODY"
[[ "$STATUS_CODE" == "200" ]] || exit 1
EMBED_URL="$(jq -r '.embed_url' <<<"$BODY")"
[[ "$EMBED_URL" == "https://streamtape.com/e/"* ]] || exit 1

EMBED_HTTP="$(curl -sS -L -o "$EVIDENCE_DIR/embed.html" -w '%{http_code}' "$EMBED_URL")"
echo "$EMBED_HTTP" | tee "$EVIDENCE_DIR/test3-embed-http.txt"
[[ "$EMBED_HTTP" == "200" ]] || { echo "Streamtape embed did not return HTTP 200" >&2; exit 1; }

echo
echo "== Test 4a: client KYC not approved must be denied =="
sql "update public.kyc_verifications set status='pending', reviewed_at=now() where id='$OLD_KYC_ID';"
json_request POST "$SUPABASE_URL/functions/v1/get-video-playback-url" "$CLIENT_TOKEN" "$(jq -nc --arg asset "$ASSET_ID" '{asset_id:$asset}')"
write_summary "test4-kyc-denied" "$BODY"
[[ "$STATUS_CODE" == "403" ]] || { echo "Expected 403 for KYC pending, got $STATUS_CODE" >&2; exit 1; }
sql "update public.kyc_verifications set status='$OLD_KYC_STATUS', reviewed_at=coalesce(reviewed_at,now()) where id='$OLD_KYC_ID';"

echo
echo "== Verify audit trail and persisted provider state =="
AUDIT_COUNT="$(sql "select count(*) from public.media_access_logs where asset_id='$ASSET_ID' and user_id='$CLIENT_ID' and action='streamtape_embed' and granted=true;")"
PERSISTED="$(sql "select json_build_object('streamtape_status',streamtape_status,'streamtape_upload_id',streamtape_upload_id,'streamtape_file_id',streamtape_file_id) from public.media_assets where id='$ASSET_ID';")"
[[ "$AUDIT_COUNT" == "1" ]] || { echo "Playback audit log missing" >&2; exit 1; }
[[ "$(jq -r '.streamtape_status' <<<"$PERSISTED")" == "ready" ]] || exit 1
[[ "$(jq -r '.streamtape_file_id' <<<"$PERSISTED")" == "$STREAMTAPE_FILE_ID" ]] || exit 1

cat > "$EVIDENCE_DIR/summary.json" <<JSON
{
  "asset_id": "$ASSET_ID",
  "post_id": "$POST_ID",
  "upload_id": "$STREAMTAPE_UPLOAD_ID",
  "file_id": "$STREAMTAPE_FILE_ID",
  "embed_url": "$EMBED_URL",
  "embed_http": $EMBED_HTTP,
  "authorized_playback_http": $STATUS_CODE,
  "unauthorized_no_subscription_http": 403,
  "unauthorized_kyc_http": 403,
  "audit_rows": $AUDIT_COUNT,
  "persisted": $PERSISTED
}
JSON

echo
echo "== REAL EVIDENCE COMPLETE =="
jq -S . "$EVIDENCE_DIR/summary.json"
