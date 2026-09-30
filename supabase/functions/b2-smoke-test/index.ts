import { DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.1142.0";
import { b2Bucket, b2Client, presignDownload, presignUpload } from "../_shared/b2.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authHeader(request: Request): string {
  const value = request.headers.get("Authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("unauthorized");
  return value;
}

async function runDirectB2Smoke() {
  const key = "__smoke__/b2/" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID() + ".txt";
  const payload = "PRIVELY-B2-SMOKE-" + crypto.randomUUID();
  const bucket = b2Bucket();
  const uploadUrl = await presignUpload(key, "text/plain", 300);
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: payload,
  });
  if (!uploadResponse.ok) throw new Error("upload_http_" + uploadResponse.status);
  const downloadUrl = await presignDownload(key, 60);
  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) throw new Error("download_http_" + downloadResponse.status);
  const downloaded = await downloadResponse.text();
  const contentMatches = downloaded === payload;
  await b2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return {
    ok: contentMatches,
    provider: "backblaze_b2",
    bucket,
    key,
    uploadStatus: uploadResponse.status,
    downloadStatus: downloadResponse.status,
    contentMatches,
    cleanup: "deleted",
    downloadExpiresIn: 60,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({})) as { postId?: unknown };

    if (typeof body.postId !== "string") {
      return json(await runDirectB2Smoke());
    }

    const authorization = authHeader(request);
    if (!/^[0-9a-f-]{36}$/i.test(body.postId)) return json({ code: "invalid_post_id" }, 400);

    const baseUrl = env("SUPABASE_URL") + "/functions/v1";
    const png = new Uint8Array([
      137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
      0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,
      0,0,0,12,73,68,65,84,8,215,99,248,207,192,240,
      31,0,5,0,1,255,137,153,61,29,0,0,0,0,73,
      69,78,68,174,66,96,130
    ]);

    const prepare = await fetch(baseUrl + "/create-media-upload", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: body.postId,
        kind: "image",
        mimeType: "image/png",
        fileSize: png.byteLength,
        originalFilename: "b2-authenticated-smoke.png",
        participantsConsent: true,
      }),
    });

    const plan = await prepare.json().catch(() => ({})) as Record<string, unknown>;
    if (!prepare.ok) return json({ ok: false, stage: "create_media_upload", status: prepare.status, plan }, 502);

    const uploadUrl = typeof plan.uploadUrl === "string" ? plan.uploadUrl : "";
    const assetId = typeof plan.assetId === "string" ? plan.assetId : "";
    const path = typeof plan.path === "string" ? plan.path : "";
    if (!uploadUrl || !assetId || !path) return json({ ok: false, stage: "plan_invalid" }, 502);

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    if (!uploadResponse.ok) throw new Error("b2_upload_http_" + uploadResponse.status);

    const media = await fetch(baseUrl + "/get-media-url", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, variant: "original" }),
    });
    const mediaBody = await media.json().catch(() => ({})) as Record<string, unknown>;
    if (!media.ok) return json({ ok: false, stage: "get_media_url", status: media.status, media: mediaBody, assetId }, 502);

    const downloadUrl = typeof mediaBody.url === "string" ? mediaBody.url : "";
    const downloaded = await fetch(downloadUrl);
    const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
    const contentMatches =
      downloaded.ok &&
      downloadedBytes.byteLength === png.byteLength &&
      downloadedBytes.every((value, index) => value === png[index]);

    await b2Client().send(new DeleteObjectCommand({ Bucket: b2Bucket(), Key: path }));

    return json({
      ok: contentMatches && mediaBody.source === "backblaze_b2" && mediaBody.expiresIn === 60,
      provider: "backblaze_b2",
      bucket: b2Bucket(),
      assetId,
      path,
      createMediaUploadStatus: prepare.status,
      uploadStatus: uploadResponse.status,
      getMediaUrlStatus: media.status,
      downloadStatus: downloaded.status,
      contentMatches,
      source: mediaBody.source,
      expiresIn: mediaBody.expiresIn,
      cleanup: "deleted",
    }, contentMatches ? 200 : 502);
  } catch (error) {
    return json({ ok: false, code: error instanceof Error ? error.message : "b2_smoke_failed" }, 502);
  }
});
