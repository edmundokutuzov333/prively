import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  try {
    const { client } = await requireUser(request);
    const payload = await request.json() as { assetId?: unknown };
    if (typeof payload.assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.assetId)) return jsonResponse({ code: "invalid_asset_id" }, 400);
    const { data, error } = await client.rpc("get_media_access", { _asset: payload.assetId });
    if (error || !data || typeof data !== "object") return jsonResponse({ code: error?.code ?? "media_forbidden" }, 403);
    const access = data as { path?: unknown; kind?: unknown; asset_id?: unknown };
    if (typeof access.path !== "string") return jsonResponse({ code: "media_path_missing" }, 500);
    const admin = serviceClient();
    const { data: signed, error: storageError } = await admin.storage.from("prively-private").createSignedUrl(access.path, 60);
    if (storageError || !signed?.signedUrl) return jsonResponse({ code: "signed_url_failed" }, 500);
    return new Response(JSON.stringify({
      assetId: access.asset_id ?? payload.assetId,
      kind: access.kind ?? null,
      url: signed.signedUrl,
      expiresIn: 60,
    }), { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_url_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
