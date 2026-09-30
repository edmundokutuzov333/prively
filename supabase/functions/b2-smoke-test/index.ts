import { DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.1142.0";
import { b2Bucket, b2Client, presignDownload, presignUpload } from "../_shared/b2.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ code: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const key = `__smoke__/b2/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.txt`;
  const payload = `PRIVELY-B2-SMOKE-${crypto.randomUUID()}`;
  const bucket = b2Bucket();

  try {
    const uploadUrl = await presignUpload(key, "text/plain", 300);
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: payload,
    });
    if (!uploadResponse.ok) throw new Error(`upload_http_${uploadResponse.status}`);

    const downloadUrl = await presignDownload(key, 60);
    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) throw new Error(`download_http_${downloadResponse.status}`);
    const downloaded = await downloadResponse.text();

    const contentMatches = downloaded === payload;

    await b2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    return new Response(JSON.stringify({
      ok: contentMatches,
      provider: "backblaze_b2",
      bucket,
      key,
      uploadStatus: uploadResponse.status,
      downloadStatus: downloadResponse.status,
      contentMatches,
      cleanup: "deleted",
      downloadExpiresIn: 60,
    }), {
      status: contentMatches ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    try {
      await b2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // Best-effort cleanup only.
    }

    return new Response(JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "b2_smoke_failed",
      bucket,
      key,
    }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
