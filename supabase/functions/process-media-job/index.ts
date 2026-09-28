import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";

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

async function signedSourceUrl(
  admin: ReturnType<typeof serviceClient>,
  path: string,
  expiresIn = 300,
): Promise<string> {
  const { data, error } = await admin.storage.from("prively-private").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error("signed_source_url_failed");
  return data.signedUrl;
}

async function executeProviderJob(
  admin: ReturnType<typeof serviceClient>,
  job: Record<string, unknown>,
  asset: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const jobType = String(job.job_type);
  const endpoint = jobType === "moderation"
    ? env("MEDIA_SCAN_ENDPOINT", false)
    : env("MEDIA_PROCESSOR_ENDPOINT", false);

  if (!endpoint) throw new Error("processor_not_configured");

  const token = jobType === "moderation"
    ? env("MEDIA_SCAN_TOKEN", false)
    : env("MEDIA_PROCESSOR_TOKEN", false);

  const sourceUrl = await signedSourceUrl(admin, String(asset.storage_path));
  const payload = {
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
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`processor_http_${response.status}`);

  const result = await response.json() as Record<string, unknown>;
  if (result.status !== "succeeded" && result.status !== "clean" && result.status !== "flagged" && result.status !== "review") {
    throw new Error("processor_invalid_status");
  }

  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const secret = env("MEDIA_JOB_SECRET");
    if (request.headers.get("x-prively-job-secret") !== secret) {
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
              processing_status: "failed",
              moderation_status: "flagged",
              scan_status: "flagged",
            })
            .eq("id", asset.id);

          throw new Error("server_sha256_mismatch");
        }

        await admin
          .from("media_assets")
          .update({
            sha256: computedSha,
            integrity_status: "verified",
            processing_status: "queued",
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

        return jsonResponse({ ok: true, jobId: job.id, status: "succeeded", sha256: computedSha });
      }

      if (job.job_type === "moderation") {
        const result = await executeProviderJob(admin, job, asset);
        const moderationStatus = String(result.status);
        const mapped = moderationStatus === "clean" ? "clean" : moderationStatus === "flagged" ? "flagged" : "review";
        await admin
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

        await admin
          .from("media_assets")
          .update({
            moderation_status: mapped,
            scan_status: mapped === "clean" ? "clean" : "flagged",
            processing_status: mapped === "clean" ? "ready" : "failed",
            ready_at: mapped === "clean" ? new Date().toISOString() : null,
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

        return jsonResponse({ ok: true, jobId: job.id, status: mapped });
      }

      const result = await executeProviderJob(admin, job, asset);

      const output = result.output && typeof result.output === "object"
        ? result.output as Record<string, unknown>
        : {};

      const patch: Record<string, unknown> = {};
      if (typeof output.hlsPath === "string") patch.hls_path = output.hlsPath;
      if (typeof output.thumbnailPath === "string") patch.thumb_blur_path = output.thumbnailPath;
      if (typeof output.watermarkPath === "string") patch.metadata = { ...asset.metadata, watermarkPath: output.watermarkPath };

      if (Object.keys(patch).length > 0) {
        await admin.from("media_assets").update(patch).eq("id", asset.id);
      }

      await admin
        .from("media_processing_jobs")
        .update({
          status: "succeeded",
          output: result,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return jsonResponse({ ok: true, jobId: job.id, status: "succeeded", output });
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
          available_at: terminal ? new Date().toISOString() : new Date(Date.now() + Math.min(attempts * 60_000, 900_000)).toISOString(),
        })
        .eq("id", job.id);

      if (job.job_type === "integrity") {
        await admin
          .from("media_assets")
          .update({
            processing_status: terminal ? "failed" : "queued",
            integrity_status: message === "server_sha256_mismatch" ? "mismatch" : "pending",
          })
          .eq("id", asset.id);
      }

      return jsonResponse({
        ok: false,
        jobId: job.id,
        status: blocked ? "blocked" : terminal ? "failed" : "queued",
        code: message,
      }, blocked ? 503 : terminal ? 422 : 202);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_worker_error";
    return jsonResponse({ code }, code === "forbidden" ? 403 : 400);
  }
});
