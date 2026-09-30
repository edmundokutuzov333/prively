#!/usr/bin/env node
/* global process, console */
#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const backend = (process.env.MEDIA_BACKEND ?? "both").toLowerCase();
if (!["supabase", "b2", "both"].includes(backend)) throw new Error("MEDIA_BACKEND must be supabase|b2|both");

if (backend === "supabase") {
  console.log("MEDIA_BACKEND=supabase: migration skipped.");
  process.exit(0);
}

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "B2_ENDPOINT", "B2_REGION", "B2_BUCKET_NAME", "B2_KEY_ID", "B2_APPLICATION_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let aws;
try {
  aws = await import("@aws-sdk/client-s3");
} catch {
  throw new Error("Install @aws-sdk/client-s3 before running this migration script. The script intentionally refuses a non-SDK write path.");
}

const { S3Client, PutObjectCommand, HeadObjectCommand } = aws;
const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});

const bucket = process.env.B2_BUCKET_NAME;
const dryRun = process.argv.includes("--dry-run");
const sourceBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "prively-private";
const pageSize = 100;

function extensionForMime(mime) {
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
    "audio/x-wav": "wav", "audio/aac": "aac",
  };
  return map[mime] ?? mime.split("/")[1]?.replace(/[^a-z0-9]+/gi, "").toLowerCase() ?? "bin";
}

async function loadPage(from) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id,storage_path,storage_provider,mime_type,original_filename,file_size_bytes,metadata,channel_id,channels(owner_id)")
    .neq("storage_provider", "backblaze_b2")
    .order("created_at", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return data ?? [];
}

let copied = 0, skipped = 0, failed = 0, seen = 0;
for (let from = 0; ; from += pageSize) {
  const assets = await loadPage(from);
  if (!assets.length) break;

  for (const asset of assets) {
    seen++;
    const ownerId = asset.channels?.owner_id;
    if (!ownerId) {
      console.warn(JSON.stringify({ assetId: asset.id, result: "skipped", reason: "channel_owner_missing" }));
      skipped++;
      continue;
    }

    const key = `users/${ownerId}/media/${asset.id}.${extensionForMime(asset.mime_type ?? "application/octet-stream")}`;

    try {
      const { data: blob, error: downloadError } = await supabase
        .storage
        .from(sourceBucket)
        .download(asset.storage_path);

      if (downloadError || !blob) throw new Error(downloadError?.message ?? "supabase_download_failed");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const contentType = asset.mime_type || "application/octet-stream";
      const digest = createHash("sha256").update(bytes).digest("hex");

      if (dryRun) {
        console.log(JSON.stringify({ assetId: asset.id, source: asset.storage_path, target: key, bytes: bytes.byteLength, sha256: digest, result: "dry_run" }));
        continue;
      }

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }));

      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (Number(head.ContentLength) !== bytes.byteLength) throw new Error("b2_size_verification_failed");

      const { error: assetUpdateError } = await supabase
        .from("media_assets")
        .update({
          storage_provider: "backblaze_b2",
          storage_path: key,
          metadata: {
            ...(asset.metadata ?? {}),
            storage_provider: "backblaze_b2",
            bucket,
            media_key_version: 2,
            migrated_from: sourceBucket,
            migration_sha256: digest,
          },
        })
        .eq("id", asset.id);

      if (assetUpdateError) throw assetUpdateError;

      await supabase
        .from("media_uploads")
        .update({ bucket_id: bucket, storage_path: key })
        .eq("asset_id", asset.id);

      copied++;
      console.log(JSON.stringify({ assetId: asset.id, target: key, bytes: bytes.byteLength, sha256: digest, result: "copied" }));
    } catch (error) {
      failed++;
      console.error(JSON.stringify({
        assetId: asset.id,
        source: asset.storage_path,
        target: key,
        result: "failed",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (assets.length < pageSize) break;
}

console.log(JSON.stringify({ backend, dryRun, sourceBucket, targetBucket: bucket, seen, copied, skipped, failed }));
if (failed > 0) process.exitCode = 1;
