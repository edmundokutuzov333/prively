import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client } = await requireUser(request);
    const payload = await request.json() as { assetId?: unknown };

    if (typeof payload.assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.assetId)) {
      return jsonResponse({ code: "invalid_asset_id" }, 400);
    }

    const accessResult = await client.rpc("get_media_access", { _asset: payload.assetId });

    if (accessResult.error || !accessResult.data || typeof accessResult.data !== "object") {
      const previewResult = await client.rpc("get_media_preview", { _asset: payload.assetId });

      if (previewResult.error || !previewResult.data || typeof previewResult.data !== "object") {
        return jsonResponse({ code: "media_forbidden" }, 403);
      }

      const preview = previewResult.data as {
        asset_id?: unknown;
        kind?: unknown;
        thumbnail_path?: unknown;
        blurhash?: unknown;
        expires_in?: unknown;
      };

      if (typeof preview.thumbnail_path !== "string") {
        return jsonResponse({ code: "media_preview_unavailable" }, 404);
      }

      const admin = serviceClient();
      const thumbnail = await admin.storage
        .from("prively-private")
        .createSignedUrl(preview.thumbnail_path, 60);

      if (thumbnail.error || !thumbnail.data?.signedUrl) {
        return jsonResponse({ code: "signed_preview_failed" }, 500);
      }

      return jsonResponse({
        assetId: preview.asset_id ?? payload.assetId,
        kind: preview.kind ?? null,
        locked: true,
        url: null,
        thumbnailUrl: thumbnail.data.signedUrl,
        blurhash: typeof preview.blurhash === "string" ? preview.blurhash : null,
        source: "locked_preview",
        expiresIn: typeof preview.expires_in === "number" ? preview.expires_in : 60,
      });
    }

    const access = accessResult.data as {
      asset_id?: unknown;
      path?: unknown;
      hls_path?: unknown;
      thumb_blur_path?: unknown;
      kind?: unknown;
      watermark_enabled?: unknown;
      watermark_text?: unknown;
      watermark_path?: unknown;
      processing_status?: unknown;
      expires_in?: unknown;
    };

    if (typeof access.path !== "string") {
      return jsonResponse({ code: "media_path_missing" }, 500);
    }

    const admin = serviceClient();
    const storage = admin.storage.from("prively-private");

    const watermarkPath = typeof access.watermark_path === "string" ? access.watermark_path : null;
    const useWatermark = access.watermark_enabled === true && Boolean(watermarkPath);
    const primaryPath = useWatermark
      ? watermarkPath!
      : typeof access.hls_path === "string" && access.kind === "video"
        ? access.hls_path
        : access.path;

    const signed = await storage.createSignedUrl(primaryPath, 60);
    if (signed.error || !signed.data?.signedUrl) {
      return jsonResponse({ code: "signed_url_failed" }, 500);
    }

    let thumbnailUrl: string | null = null;
    if (typeof access.thumb_blur_path === "string") {
      const thumb = await storage.createSignedUrl(access.thumb_blur_path, 60);
      if (!thumb.error && thumb.data?.signedUrl) thumbnailUrl = thumb.data.signedUrl;
    }

    return jsonResponse({
      assetId: access.asset_id ?? payload.assetId,
      kind: access.kind ?? null,
      locked: false,
      url: signed.data.signedUrl,
      thumbnailUrl,
      source: useWatermark
        ? "watermark"
        : primaryPath === access.path
          ? "original"
          : "hls",
      expiresIn: typeof access.expires_in === "number" ? access.expires_in : 60,
      processingStatus: typeof access.processing_status === "string" ? access.processing_status : null,
      watermark: {
        enabled: access.watermark_enabled === true,
        applied: useWatermark,
        text: typeof access.watermark_text === "string" ? access.watermark_text : null,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_url_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
