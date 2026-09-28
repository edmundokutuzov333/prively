import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client } = await requireUser(request);
    const body = await request.json() as { assetId?: unknown };

    if (typeof body.assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.assetId)) {
      return jsonResponse({ code: "invalid_asset_id" }, 400);
    }

    const { data, error } = await client.rpc("get_media_preview", {
      _asset: body.assetId,
    });

    if (error || !data || typeof data !== "object") {
      return jsonResponse({ code: "media_preview_forbidden" }, 403);
    }

    const preview = data as {
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
    const signed = await admin.storage
      .from("prively-private")
      .createSignedUrl(preview.thumbnail_path, 60);

    if (signed.error || !signed.data?.signedUrl) {
      return jsonResponse({ code: "signed_preview_failed" }, 500);
    }

    return jsonResponse({
      assetId: preview.asset_id ?? body.assetId,
      kind: preview.kind ?? null,
      locked: true,
      thumbnailUrl: signed.data.signedUrl,
      blurhash: typeof preview.blurhash === "string" ? preview.blurhash : null,
      expiresIn: typeof preview.expires_in === "number" ? preview.expires_in : 60,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_preview_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
