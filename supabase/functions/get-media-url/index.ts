import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  B2ConfigurationError,
  B2ObjectNotFoundError,
  B2UnavailableError,
  mediaBackend,
  presignDownload,
} from "../_shared/b2.ts";
import { corsFor, optionsResponse } from "../_shared/cors.ts";

function jsonResponse(
  body: unknown,
  status = 200,
  request?: Request,
  correlationId?: string,
  retryAfter?: number,
): Response {
  const headers: Record<string, string> = {
    ...corsFor(request),
    "Content-Type": "application/json",
  };
  if (correlationId) headers["x-correlation-id"] = correlationId;
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return new Response(JSON.stringify(body), { status, headers });
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

function isB2Original(path: string, assetPath: string, provider: unknown, backend: ReturnType<typeof mediaBackend>): boolean {
  if (path !== assetPath) return false;
  if (provider === "backblaze_b2") return true;
  return backend === "b2";
}

Deno.serve(async (request) => {
  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();

  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed" }, 405, request, correlationId);
  }

  try {
    // Authorization is resolved first and the DB access RPC is evaluated before any B2 signing.
    const { client } = await requireUser(request);
    const payload = await request.json() as { assetId?: unknown; variant?: unknown };

    if (typeof payload.assetId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.assetId)) {
      return jsonResponse({ code: "invalid_asset_id" }, 400, request, correlationId);
    }

    const { data, error } = await client.rpc("get_media_access", { _asset: payload.assetId });
    if (error || !data || typeof data !== "object") {
      return jsonResponse({ code: error?.code ?? "media_forbidden" }, 403, request, correlationId);
    }

    const access = data as {
      asset_id?: unknown;
      path?: unknown;
      storage_provider?: unknown;
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
      return jsonResponse({ code: "media_path_missing" }, 500, request, correlationId);
    }

    const backend = mediaBackend();
    const admin = serviceClient();
    const storage = admin.storage.from("prively-private");
    const watermarkPath = typeof access.watermark_path === "string" ? access.watermark_path : null;
    const variant =
      payload.variant === "face_blur" || payload.variant === "original"
        ? payload.variant
        : "default";
    const faceBlurPath = typeof access.face_blur_path === "string" ? access.face_blur_path : null;
    const useFaceBlur = variant === "face_blur";
    if (useFaceBlur && !faceBlurPath) {
      return jsonResponse({ code: "face_blur_unavailable" }, 404, request, correlationId);
    }

    const useWatermark = !useFaceBlur && access.watermark_enabled === true && Boolean(watermarkPath);

    const primaryPath = useFaceBlur
      ? faceBlurPath!
      : useWatermark
        ? watermarkPath!
        : typeof access.hls_path === "string" && access.kind === "video"
          ? access.hls_path
          : access.path;

    const sourceIsB2 = isB2Original(
      primaryPath,
      access.path,
      access.storage_provider,
      backend,
    );

    let signedUrl: string;
    if (sourceIsB2) {
      signedUrl = await presignDownload(primaryPath, 60);
    } else {
      const signed = await storage.createSignedUrl(primaryPath, 60);
      if (signed.error || !signed.data?.signedUrl) throw new Error("signed_url_failed");
      signedUrl = signed.data.signedUrl;
    }

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

    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

    return jsonResponse({
      assetId: access.asset_id ?? payload.assetId,
      kind: access.kind ?? null,
      url: signedUrl,
      expiresAt,
      thumbnailUrl,
      captionUrl,
      source: sourceIsB2
        ? "backblaze_b2"
        : useFaceBlur
          ? "face_blur"
          : useWatermark
            ? "watermark"
            : primaryPath === access.path
              ? "original"
              : "hls",
      variant,
      expiresIn: 60,
      processingStatus: typeof access.processing_status === "string" ? access.processing_status : null,
      watermark: {
        enabled: access.watermark_enabled === true,
        applied: useWatermark,
        text: typeof access.watermark_text === "string" ? access.watermark_text : null,
      },
    }, 200, request, correlationId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_url_error";

    console.error(JSON.stringify({
      event: "get_media_url_error",
      correlationId,
      code,
    }));

    if (error instanceof B2ObjectNotFoundError) {
      return jsonResponse({
        code: "media_not_found",
        message: "O ficheiro de media pedido não existe no Backblaze B2.",
        correlationId,
      }, 404, request, correlationId);
    }

    if (error instanceof B2UnavailableError) {
      return jsonResponse({
        code: "b2_unavailable",
        message: "O armazenamento de media está temporariamente indisponível. Tente novamente.",
        retry: true,
        correlationId,
      }, 503, request, correlationId, 15);
    }

    if (error instanceof B2ConfigurationError) {
      return jsonResponse({
        code,
        message: "A configuração do armazenamento de media não está pronta.",
        retry: false,
        correlationId,
      }, 500, request, correlationId);
    }

    return jsonResponse({
      code,
      correlationId,
    }, code === "unauthorized" ? 401 : 400, request, correlationId);
  }
});
