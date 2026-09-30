import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { corsFor, optionsResponse } from "../_shared/cors.ts";
import { presignDownload } from "../_shared/b2.ts";

function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(request), "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function userClient(request: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(request: Request): Promise<{ client: SupabaseClient; user: User }> {
  const client = userClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");
  return { client, user: data.user };
}

function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405, request);

  try {
    const { client } = await requireUser(request);
    const payload = await request.json() as { assetId?: unknown; variant?: unknown };

    if (typeof payload.assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.assetId)) {
      return jsonResponse({ code: "invalid_asset_id" }, 400, request);
    }

    // Permission is evaluated through the caller's Supabase JWT/RLS context.
    const { data, error } = await client.rpc("get_media_access", { _asset: payload.assetId });
    if (error || !data || typeof data !== "object") {
      return jsonResponse({ code: error?.code ?? "media_forbidden" }, 403, request);
    }

    const access = data as {
      asset_id?: unknown;
      path?: unknown;
      face_blur_path?: unknown;
      caption_path?: unknown;
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
      return jsonResponse({ code: "media_path_missing" }, 500, request);
    }

    const admin = serviceClient();
    const storage = admin.storage.from("prively-private");
    const watermarkPath = typeof access.watermark_path === "string" ? access.watermark_path : null;
    const variant = payload.variant === "face_blur" || payload.variant === "original" ? payload.variant : "default";
    const faceBlurPath = typeof access.face_blur_path === "string" ? access.face_blur_path : null;
    const useFaceBlur = variant === "face_blur";
    if (useFaceBlur && !faceBlurPath) return jsonResponse({ code: "face_blur_unavailable" }, 404, request);
    const useWatermark = !useFaceBlur && access.watermark_enabled === true && Boolean(watermarkPath);

    const primaryPath = useFaceBlur
      ? faceBlurPath!
      : useWatermark
        ? watermarkPath!
        : typeof access.hls_path === "string" && access.kind === "video"
          ? access.hls_path
          : access.path;

    const isOriginalB2 = primaryPath === access.path;
    const signedUrl = isOriginalB2
      ? await presignDownload(primaryPath, 60)
      : await (async () => {
          const signed = await storage.createSignedUrl(primaryPath, 60);
          if (signed.error || !signed.data?.signedUrl) throw new Error("signed_url_failed");
          return signed.data.signedUrl;
        })();

    let thumbnailUrl: string | null = null;
    let captionUrl: string | null = null;

    if (typeof access.caption_path === "string") {
      const caption = await storage.createSignedUrl(access.caption_path, 60);
      if (!caption.error && caption.data?.signedUrl) captionUrl = caption.data.signedUrl;
    }

    if (typeof access.thumb_blur_path === "string") {
      const thumb = await storage.createSignedUrl(access.thumb_blur_path, 60);
      if (!thumb.error && thumb.data?.signedUrl) thumbnailUrl = thumb.data.signedUrl;
    }

    return jsonResponse({
      assetId: access.asset_id ?? payload.assetId,
      kind: access.kind ?? null,
      url: signedUrl,
      thumbnailUrl,
      captionUrl,
      source: isOriginalB2
        ? "backblaze_b2"
        : useFaceBlur
          ? "face_blur"
          : useWatermark
            ? "watermark"
            : "hls",
      variant,
      expiresIn: 60,
      processingStatus: typeof access.processing_status === "string" ? access.processing_status : null,
      watermark: {
        enabled: access.watermark_enabled === true,
        applied: useWatermark,
        text: typeof access.watermark_text === "string" ? access.watermark_text : null,
      },
    }, 200, request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_url_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400, request);
  }
});
