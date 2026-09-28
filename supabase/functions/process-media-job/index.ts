import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

function env(name: string, required = true): string | null {
  const value = Deno.env.get(name);
  if (!value && required) throw new Error(`missing_env:${name}`);
  return value ?? null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return hex(new Uint8Array(digest));
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
    action: `processing:${jobType}`,
    granted: true,
    reason: "server_worker",
  });
  if (error) throw new Error("processing_access_audit_failed");
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);

    const permission = await client.rpc("has_permission", {
      _uid: user.id,
      _permission: "admin.moderation",
    });
    if (permission.error || permission.data !== true) {
      return jsonResponse({ code: "forbidden" }, 403);
    }

    const body = await request.json() as { jobId?: unknown };
    if (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.jobId)) {
      return jsonResponse({ code: "invalid_job_id" }, 400);
    }

    const admin = serviceClient();
    const { data: job, error: jobError } = await admin
      .from("media_processing_jobs")
      .select("*")
      .eq("id", body.jobId)
      .single();

    if (jobError || !job) return jsonResponse({ code: "job_not_found" }, 404);
    if (!["queued", "failed", "blocked"].includes(job.status)) {
      return jsonResponse({ code: "job_not_runnable", status: job.status }, 409);
    }

    const { data: asset, error: assetError } = await admin
      .from("media_assets")
      .select("*")
      .eq("id", job.asset_id)
      .single();

    if (assetError || !asset) return jsonResponse({ code: "asset_not_found" }, 404);

    const attempts = Number(job.attempts ?? 0) + 1;
    await admin
      .from("media_processing_jobs")
      .update({
        status: "processing",
        attempts,
        started_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", job.id);

    try {
      if (job.job_type === "integrity") {
        await auditProcessingRead(admin, String(asset.id), "integrity");

        const { data: blob, error: downloadError } = await admin
          .storage
          .from("prively-private")
          .download(String(asset.storage_path));

        if (downloadError || !blob) throw new Error("media_download_failed");

        const buffer = await blob.arrayBuffer();
        if (buffer.byteLength !== Number(asset.file_size_bytes)) {
          throw new Error("media_size_mismatch");
        }

        const computedSha = await sha256Buffer(buffer);
        if (computedSha !== String(asset.client_sha256).toLowerCase()) {
          await admin
            .from("media_assets")
            .update({
              sha256: computedSha,
              integrity_status: "mismatch",
              moderation_status: "flagged",
              scan_status: "flagged",
              ready_at: null,
            })
            .eq("id", asset.id);

          throw new Error("server_sha256_mismatch");
        }

        await admin
          .from("media_assets")
          .update({
            sha256: computedSha,
            integrity_status: "verified",
            ready_at: null,
          })
          .eq("id", asset.id);

        await admin
          .from("media_processing_jobs")
          .update({
            status: "succeeded",
            output: { sha256: computedSha, bytes: buffer.byteLength },
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        const processingStatus = await refreshStatus(admin, String(asset.id));

        return jsonResponse({
          ok: true,
          jobId: job.id,
          status: "succeeded",
          processingStatus,
          sha256: computedSha,
        });
      }

      if (job.job_type === "moderation") {
        const result = await executeProviderJob(admin, job, asset);
        const moderationStatus = String(result.status);
        const mapped =
          moderationStatus === "clean"
            ? "clean"
            : moderationStatus === "flagged"
              ? "flagged"
              : "review";

        const { error: scanError } = await admin
          .from("moderation_scans")
          .insert({
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

        await admin
          .from("media_assets")
          .update({
            moderation_status: mapped,
            scan_status: mapped === "clean" ? "clean" : "flagged",
            ready_at: null,
          })
          .eq("id", asset.id);

        await admin
          .from("media_processing_jobs")
          .update({
            status: "succeeded",
            output: result,
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        const processingStatus = await refreshStatus(admin, String(asset.id));

        return jsonResponse({
          ok: true,
          jobId: job.id,
          status: mapped,
          processingStatus,
        });
      }

      const result = await executeProviderJob(admin, job, asset);
      const output =
        result.output && typeof result.output === "object"
          ? result.output as Record<string, unknown>
          : {};

      const patch: Record<string, unknown> = {};

      if (typeof output.hlsPath === "string") {
        patch.hls_path = safeDerivativePath(asset, output.hlsPath);
      }
      if (typeof output.thumbnailPath === "string") {
        patch.thumb_blur_path = safeDerivativePath(asset, output.thumbnailPath);
      }
      if (typeof output.watermarkPath === "string") {
        patch.watermark_path = safeDerivativePath(asset, output.watermarkPath);
      }
      if (typeof output.width === "number") patch.width = output.width;
      if (typeof output.height === "number") patch.height = output.height;
      if (typeof output.durationMs === "number") patch.duration_ms = output.durationMs;

      if (!Object.keys(patch).length) {
        throw new Error("processor_output_missing_derivative");
      }

      const { error: patchError } = await admin
        .from("media_assets")
        .update(patch)
        .eq("id", asset.id);

      if (patchError) throw new Error("media_derivative_update_failed");

      await admin
        .from("media_processing_jobs")
        .update({
          status: "succeeded",
          output: result,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      const processingStatus = await refreshStatus(admin, String(asset.id));

      return jsonResponse({
        ok: true,
        jobId: job.id,
        status: "succeeded",
        processingStatus,
        output: patch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "media_job_failed";
      const blocked = message === "processor_not_configured";
      const terminal = blocked || attempts >= Number(job.max_attempts ?? 5);

      await admin
        .from("media_processing_jobs")
        .update({
          status: blocked ? "blocked" : terminal ? "failed" : "queued",
          error_code: blocked ? "processor_not_configured" : message,
          error_message: message,
          finished_at: terminal ? new Date().toISOString() : null,
          available_at: terminal
            ? new Date().toISOString()
            : new Date(Date.now() + Math.min(attempts * 60000, 900000)).toISOString(),
        })
        .eq("id", job.id);

      if (job.job_type === "integrity" && message === "server_sha256_mismatch") {
        await admin
          .from("media_assets")
          .update({
            processing_status: "failed",
            integrity_status: "mismatch",
            moderation_status: "flagged",
            scan_status: "flagged",
            ready_at: null,
          })
          .eq("id", asset.id);
      }

      let processingStatus = "unknown";
      try {
        processingStatus = await refreshStatus(admin, String(asset.id));
      } catch {
        // Preserve original job failure; status reconciliation can be retried by the next job run.
      }

      return jsonResponse({
        ok: false,
        jobId: job.id,
        status: blocked ? "blocked" : terminal ? "failed" : "queued",
        processingStatus,
        code: message,
      }, blocked ? 503 : terminal ? 422 : 202);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_worker_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
