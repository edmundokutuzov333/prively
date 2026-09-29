import { createSHA256 } from "npm:hash-wasm@4.12.0";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

function env(name: string, required = true): string | null {
  const value = Deno.env.get(name);
  if (!value && required) throw new Error(`missing_env:${name}`);
  return value ?? null;
}

function derivativeRoot(asset: Record<string, unknown>): string {
  const storagePath = String(asset.storage_path ?? "");
  const assetId = String(asset.id ?? "");
  const parts = storagePath.split("/");
  if (parts.length < 4 || parts[1] !== "media" || parts[2] !== assetId) {
    throw new Error("invalid_asset_storage_path");
  }
  return `${parts[0]}/media/${assetId}/`;
}

function safeDerivativePath(asset: Record<string, unknown>, value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("invalid_derivative_path");
  if (value.startsWith("/") || value.includes("..") || value.includes("://")) {
    throw new Error("invalid_derivative_path");
  }
  const root = derivativeRoot(asset);
  if (!value.startsWith(root)) throw new Error("derivative_path_outside_asset");
  return value;
}

async function signedSourceUrl(
  admin: ReturnType<typeof serviceClient>,
  path: string,
  expiresIn = 300,
): Promise<string> {
  const { data, error } = await admin.storage.from("prively-private").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error("signed_source_url_failed");
  return data.signedUrl;
}

async function refreshStatus(
  admin: ReturnType<typeof serviceClient>,
  assetId: string,
): Promise<string> {
  const { data, error } = await admin.rpc("refresh_media_processing_status", { _asset: assetId });
  if (error) throw new Error(error.message || "processing_status_refresh_failed");
  return String(data ?? "unknown");
}

async function auditProcessingRead(
  admin: ReturnType<typeof serviceClient>,
  assetId: string,
  jobType: string,
): Promise<void> {
  const { error } = await admin.from("media_access_logs").insert({
    asset_id: assetId,
    user_id: null,
    action: "processing",
    granted: true,
    reason: `server_worker:${jobType}`,
  });
  if (error) throw new Error("processing_access_audit_failed");
}

async function sha256Stream(blob: Blob): Promise<string> {
  const hasher = await createSHA256();
  const reader = blob.stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }

  return hasher.digest();
}

async function executeProviderJob(
  admin: ReturnType<typeof serviceClient>,
  job: Record<string, unknown>,
  asset: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const jobType = String(job.job_type);
  const endpoint =
    jobType === "moderation"
      ? env("MEDIA_SCAN_ENDPOINT", false)
      : env("MEDIA_PROCESSOR_ENDPOINT", false);

  if (!endpoint) throw new Error("processor_not_configured");

  const token =
    jobType === "moderation"
      ? env("MEDIA_SCAN_TOKEN", false)
      : env("MEDIA_PROCESSOR_TOKEN", false);

  const sourceUrl = await signedSourceUrl(admin, String(asset.storage_path));
  await auditProcessingRead(admin, String(asset.id), jobType);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      contractVersion: "1",
      jobId: job.id,
      assetId: asset.id,
      jobType,
      sourceUrl,
      kind: asset.kind,
      mimeType: asset.mime_type,
      fileSizeBytes: asset.file_size_bytes,
      sha256: asset.sha256,
      watermarkText: asset.watermark_text,
    }),
  });

  if (!response.ok) throw new Error(`processor_http_${response.status}`);

  const result = await response.json() as Record<string, unknown>;
  const status = String(result.status);

  if (jobType === "moderation") {
    if (!["clean", "flagged", "review"].includes(status)) {
      throw new Error("processor_invalid_moderation_status");
    }
  } else if (status !== "succeeded") {
    throw new Error("processor_invalid_status");
  }

  return result;
}

async function executeComplianceArchive(
  admin: ReturnType<typeof serviceClient>,
  asset: Record<string, unknown>,
): Promise<{ archivePath: string; retainedUntil: string | null; alreadyArchived: boolean }> {
  const assetId = String(asset.id);
  const sha256 = String(asset.sha256 ?? "").toLowerCase();

  if (asset.integrity_status !== "verified" || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("archive_waiting_for_integrity");
  }

  const { data: existing, error: existingError } = await admin
    .from("compliance_objects")
    .select("archive_path,status,sha256,retained_until")
    .eq("source_asset_id", assetId)
    .maybeSingle();

  if (existingError) throw new Error("compliance_record_lookup_failed");
  if (existing?.status === "archived") {
    return {
      archivePath: String(existing.archive_path),
      retainedUntil: typeof existing.retained_until === "string" ? existing.retained_until : null,
      alreadyArchived: true,
    };
  }

  const archivePath = `assets/${assetId}/${sha256}`;
  const parentPath = `assets/${assetId}`;

  const { data: existingObjects, error: listError } = await admin
    .storage
    .from("compliance-archive")
    .list(parentPath, { search: sha256, limit: 1 });

  if (listError) throw new Error("compliance_object_lookup_failed");

  const existsInStorage = (existingObjects ?? []).some((item) => item.name === sha256);

  if (!existsInStorage) {
    const { error: copyError } = await admin
      .storage
      .from("prively-private")
      .copy(String(asset.storage_path), archivePath, {
        destinationBucket: "compliance-archive",
      });

    if (copyError) throw new Error("compliance_archive_copy_failed");
  }

  const { data: retentionSetting, error: retentionError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "retention_days")
    .maybeSingle();

  if (retentionError) throw new Error("retention_setting_lookup_failed");

  const raw = retentionSetting?.value;
  const configuredDays =
    typeof raw === "number"
      ? raw
      : typeof raw === "object" && raw !== null && "days" in raw
        ? Number((raw as { days?: unknown }).days)
        : Number.NaN;

  const retainedUntil =
    Number.isFinite(configuredDays) && configuredDays > 0
      ? new Date(Date.now() + configuredDays * 86_400_000).toISOString()
      : null;

  const { error: recordError } = await admin
    .from("compliance_objects")
    .upsert({
      source_asset_id: assetId,
      source_post_id: asset.post_id,
      bucket_id: "compliance-archive",
      archive_path: archivePath,
      sha256,
      status: "archived",
      retained_until: retainedUntil,
      archived_at: new Date().toISOString(),
      deleted_at: null,
    }, { onConflict: "source_asset_id" });

  if (recordError) throw new Error("compliance_record_write_failed");

  const { error: eventError } = await admin
    .from("content_archive_events")
    .insert({
      post_id: asset.post_id,
      asset_id: assetId,
      actor_id: null,
      event_type: "uploaded",
      reason: "compliance_archive",
      storage_path: archivePath,
      sha256,
      snapshot: {
        sourcePath: asset.storage_path,
        bucket: "prively-private",
        archiveBucket: "compliance-archive",
        retainedUntil,
      },
    });

  if (eventError) throw new Error("compliance_archive_event_failed");

  return {
    archivePath,
    retainedUntil,
    alreadyArchived: false,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json() as { jobId?: unknown };

    if (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.jobId)) {
      return jsonResponse({ code: "invalid_job_id" }, 400);
    }

    const admin = serviceClient();

    const { data: requestedJob, error: jobError } = await admin
      .from("media_processing_jobs")
      .select("*")
      .eq("id", body.jobId)
      .single();

    if (jobError || !requestedJob) return jsonResponse({ code: "job_not_found" }, 404);
    if (!["queued", "failed", "blocked"].includes(requestedJob.status)) {
      return jsonResponse({ code: "job_not_runnable", status: requestedJob.status }, 409);
    }

    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .select("*")
      .eq("id", requestedJob.asset_id)
      .single();

    if (assetError || !asset) return jsonResponse({ code: "asset_not_found" }, 404);

    const adminPermission = await client.rpc("has_permission", {
      _uid: user.id,
      _permission: "admin.moderation",
    });
    const isAdminWorker = !adminPermission.error && adminPermission.data === true;

    if (!isAdminWorker) {
      if (!["integrity", "archive", "caption", "face_blur", "advanced_media"].includes(String(requestedJob.job_type))) {
        return jsonResponse({ code: "forbidden" }, 403);
      }

      const { data: creatorOwner } = await admin
        .from("channels")
        .select("owner_id")
        .eq("id", asset.channel_id)
        .maybeSingle();

      if (creatorOwner?.owner_id !== user.id) {
        return jsonResponse({ code: "forbidden" }, 403);
      }
    }

    const attempts = Number(requestedJob.attempts ?? 0) + 1;

    const { data: claimedJob, error: claimError } = await admin
      .from("media_processing_jobs")
      .update({
        status: "processing",
        attempts,
        started_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", requestedJob.id)
      .in("status", ["queued", "failed", "blocked"])
      .select("*")
      .maybeSingle();

    if (claimError) throw new Error("media_job_claim_failed");
    if (!claimedJob) return jsonResponse({ code: "job_already_claimed" }, 409);

    try {
      if (claimedJob.job_type !== "integrity" && asset.integrity_status !== "verified") {
        throw new Error("archive_waiting_for_integrity");
      }

      if (claimedJob.job_type === "integrity") {
        await auditProcessingRead(admin, String(asset.id), "integrity");

        const { data: blob, error: downloadError } = await admin
          .storage
          .from("prively-private")
          .download(String(asset.storage_path));

        if (downloadError || !blob) throw new Error("media_download_failed");
        if (blob.size !== Number(asset.file_size_bytes)) throw new Error("media_size_mismatch");

        const computedSha = await sha256Stream(blob);
        const clientSha = typeof asset.client_sha256 === "string"
          ? asset.client_sha256.toLowerCase()
          : null;

        if (clientSha && computedSha !== clientSha) {
          await admin.from("media_assets").update({
            sha256: computedSha,
            integrity_status: "mismatch",
            moderation_status: "flagged",
            scan_status: "flagged",
            ready_at: null,
          }).eq("id", asset.id);
          throw new Error("server_sha256_mismatch");
        }

        const { error: assetUpdateError } = await admin.from("media_assets").update({
          sha256: computedSha,
          integrity_status: "verified",
          ready_at: null,
        }).eq("id", asset.id);

        if (assetUpdateError) throw new Error("integrity_asset_update_failed");

        const { error: jobUpdateError } = await admin.from("media_processing_jobs").update({
          status: "succeeded",
          output: { sha256: computedSha, bytes: blob.size },
          finished_at: new Date().toISOString(),
        }).eq("id", claimedJob.id);

        if (jobUpdateError) throw new Error("integrity_job_update_failed");

        const processingStatus = await refreshStatus(admin, String(asset.id));
        return jsonResponse({
          ok: true,
          jobId: claimedJob.id,
          status: "succeeded",
          processingStatus,
          sha256: computedSha,
        });
      }

      if (claimedJob.job_type === "archive") {
        const archived = await executeComplianceArchive(admin, asset);

        await admin.from("media_processing_jobs").update({
          status: "succeeded",
          output: {
            archivePath: archived.archivePath,
            retainedUntil: archived.retainedUntil,
            alreadyArchived: archived.alreadyArchived,
          },
          finished_at: new Date().toISOString(),
        }).eq("id", claimedJob.id);

        const processingStatus = await refreshStatus(admin, String(asset.id));
        return jsonResponse({
          ok: true,
          jobId: claimedJob.id,
          status: "succeeded",
          processingStatus,
          archivePath: archived.archivePath,
        });
      }

      if (claimedJob.job_type === "moderation") {
        const result = await executeProviderJob(admin, claimedJob, asset);
        const moderationStatus = String(result.status);
        const mapped =
          moderationStatus === "clean"
            ? "clean"
            : moderationStatus === "flagged"
              ? "flagged"
              : "review";

        const { error: scanError } = await admin.from("moderation_scans").insert({
          asset_id: asset.id,
          provider: String(result.provider ?? "configured-adapter"),
          provider_ref: typeof result.providerRef === "string" ? result.providerRef : null,
          status: mapped,
          categories: result.categories ?? {},
          score: typeof result.score === "number" ? result.score : null,
          raw_result: result,
          completed_at: new Date().toISOString(),
        });

        if (scanError) throw new Error("moderation_scan_record_failed");

        await admin.from("media_assets").update({
          moderation_status: mapped,
          scan_status: mapped === "clean" ? "clean" : "flagged",
          ready_at: null,
        }).eq("id", asset.id);

        await admin.from("media_processing_jobs").update({
          status: "succeeded",
          output: result,
          finished_at: new Date().toISOString(),
        }).eq("id", claimedJob.id);

        const processingStatus = await refreshStatus(admin, String(asset.id));
        return jsonResponse({
          ok: true,
          jobId: claimedJob.id,
          status: mapped,
          processingStatus,
        });
      }

      const result = await executeProviderJob(admin, claimedJob, asset);
      const output =
        result.output && typeof result.output === "object"
          ? result.output as Record<string, unknown>
          : {};

      const patch: Record<string, unknown> = {};
      if (typeof output.hlsPath === "string") patch.hls_path = safeDerivativePath(asset, output.hlsPath);
      if (typeof output.thumbnailPath === "string") patch.thumb_blur_path = safeDerivativePath(asset, output.thumbnailPath);
      if (typeof output.watermarkPath === "string") patch.watermark_path = safeDerivativePath(asset, output.watermarkPath);
      if (typeof output.captionPath === "string") patch.caption_path = safeDerivativePath(asset, output.captionPath);
      if (typeof output.faceBlurPath === "string") patch.face_blur_path = safeDerivativePath(asset, output.faceBlurPath);
      if (typeof output.width === "number") patch.width = output.width;
      if (typeof output.height === "number") patch.height = output.height;
      if (typeof output.durationMs === "number") patch.duration_ms = output.durationMs;

      if (typeof output.blurhash === "string" && output.blurhash.length <= 512 && asset.post_id) {
        const { error: blurhashError } = await admin
          .from("posts")
          .update({ blurhash: output.blurhash })
          .eq("id", asset.post_id);
        if (blurhashError) throw new Error("post_blurhash_update_failed");
      }

      if (!Object.keys(patch).length) throw new Error("processor_output_missing_derivative");

      const { error: patchError } = await admin.from("media_assets").update(patch).eq("id", asset.id);
      if (patchError) throw new Error("media_derivative_update_failed");

      await admin.from("media_processing_jobs").update({
        status: "succeeded",
        output: result,
        finished_at: new Date().toISOString(),
      }).eq("id", claimedJob.id);

      const processingStatus = await refreshStatus(admin, String(asset.id));
      return jsonResponse({
        ok: true,
        jobId: claimedJob.id,
        status: "succeeded",
        processingStatus,
        output: patch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "media_job_failed";
      const waitingForIntegrity = message === "archive_waiting_for_integrity";
      const blocked = message === "processor_not_configured";
      const terminal = !waitingForIntegrity && (blocked || attempts >= Number(requestedJob.max_attempts ?? 5));

      await admin.from("media_processing_jobs").update({
        status: waitingForIntegrity ? "queued" : blocked ? "blocked" : terminal ? "failed" : "queued",
        attempts: waitingForIntegrity ? Math.max(attempts - 1, 0) : attempts,
        error_code: waitingForIntegrity ? null : blocked ? "processor_not_configured" : message,
        error_message: waitingForIntegrity ? null : message,
        finished_at: terminal ? new Date().toISOString() : null,
        available_at: new Date(Date.now() + Math.min((waitingForIntegrity ? 1 : attempts) * 60000, 900000)).toISOString(),
      }).eq("id", claimedJob.id);

      if (message === "server_sha256_mismatch") {
        await admin.from("media_assets").update({
          processing_status: "failed",
          integrity_status: "mismatch",
          moderation_status: "flagged",
          scan_status: "flagged",
          ready_at: null,
        }).eq("id", asset.id);
      }

      let processingStatus = "unknown";
      try {
        processingStatus = await refreshStatus(admin, String(asset.id));
      } catch {
        // Preserve original job failure.
      }

      return jsonResponse({
        ok: false,
        jobId: claimedJob.id,
        status: waitingForIntegrity ? "queued" : blocked ? "blocked" : terminal ? "failed" : "queued",
        processingStatus,
        code: message,
      }, waitingForIntegrity ? 202 : blocked ? 503 : terminal ? 422 : 202);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_worker_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
