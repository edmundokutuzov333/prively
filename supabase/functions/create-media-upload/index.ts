import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { b2Bucket, B2AuthError, B2ConfigurationError, B2UnavailableError, mediaBackend, presignUpload } from "../_shared/b2.ts";
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

function storageProviderForBackend(backend: ReturnType<typeof mediaBackend>): "supabase" | "backblaze_b2" {
  return backend === "supabase" ? "supabase" : "backblaze_b2";
}

function providerLabel(provider: "supabase" | "backblaze_b2"): string {
  return provider === "backblaze_b2" ? "backblaze_b2" : "supabase";
}

Deno.serve(async (request) => {
  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();

  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed" }, 405, request, correlationId);
  }

  try {
    const { client } = await requireUser(request);
    const body = await request.json() as {
      postId?: unknown;
      kind?: unknown;
      mimeType?: unknown;
      fileSize?: unknown;
      sha256?: unknown;
      originalFilename?: unknown;
      participantsConsent?: unknown;
    };

    if (
      typeof body.postId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.postId) ||
      typeof body.kind !== "string" ||
      typeof body.mimeType !== "string" ||
      typeof body.fileSize !== "number" ||
      !Number.isSafeInteger(body.fileSize) ||
      typeof body.originalFilename !== "string" ||
      typeof body.participantsConsent !== "boolean"
    ) {
      return jsonResponse({ code: "invalid_upload_request" }, 400, request, correlationId);
    }

    const { data, error } = await client.rpc("create_media_upload", {
      _post: body.postId,
      _kind: body.kind,
      _mime_type: body.mimeType,
      _file_size: body.fileSize,
      _sha256: typeof body.sha256 === "string" ? body.sha256 : null,
      _original_filename: body.originalFilename,
      _participants_consent: body.participantsConsent,
    });

    if (error || !data || typeof data !== "object") {
      return jsonResponse(
        { code: error?.code ?? error?.message ?? "media_upload_prepare_failed" },
        400,
        request,
        correlationId,
      );
    }

    const plan = data as {
      uploadId?: unknown;
      assetId?: unknown;
      path?: unknown;
      expiresAt?: unknown;
    };

    if (
      typeof plan.uploadId !== "string" ||
      typeof plan.assetId !== "string" ||
      typeof plan.path !== "string"
    ) {
      return jsonResponse({ code: "media_upload_plan_invalid" }, 500, request, correlationId);
    }

    const backend = mediaBackend();
    const provider = storageProviderForBackend(backend);
    const admin = serviceClient();

    let uploadUrl: string;
    let expiresAt: string;
    let bucket: string;

    if (provider === "backblaze_b2") {
      uploadUrl = await presignUpload(plan.path, body.mimeType, 15 * 60);
      expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      bucket = b2Bucket();
    } else {
      const signed = await admin.storage
        .from("prively-private")
        .createSignedUploadUrl(plan.path, { upsert: false });

      if (signed.error || !signed.data?.signedUrl) {
        throw new Error("signed_upload_url_failed");
      }

      uploadUrl = signed.data.signedUrl;
      expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      bucket = "prively-private";
    }

    const { data: assetRecord, error: assetReadError } = await admin
      .from("media_assets")
      .select("metadata")
      .eq("id", plan.assetId)
      .single();

    if (assetReadError) {
      return jsonResponse({ code: "media_provider_read_failed" }, 500, request, correlationId);
    }

    const storageProvider = providerLabel(provider);
    const nextMetadata = {
      ...(assetRecord?.metadata && typeof assetRecord.metadata === "object" ? assetRecord.metadata : {}),
      storage_provider: storageProvider,
      bucket,
      media_backend: backend,
      correlation_id: correlationId,
    };

    const { error: providerError } = await admin
      .from("media_assets")
      .update({
        storage_provider: storageProvider,
        metadata: nextMetadata,
      })
      .eq("id", plan.assetId);

    if (providerError) {
      return jsonResponse({ code: "media_provider_update_failed" }, 500, request, correlationId);
    }

    const { error: uploadRecordError } = await admin
      .from("media_uploads")
      .update({ bucket_id: bucket })
      .eq("id", plan.uploadId);

    if (uploadRecordError) {
      return jsonResponse({ code: "media_upload_record_update_failed" }, 500, request, correlationId);
    }

    return jsonResponse({
      uploadId: plan.uploadId,
      assetId: plan.assetId,
      path: plan.path,
      key: plan.path,
      bucket,
      provider,
      uploadMethod: "PUT",
      uploadUrl,
      uploadHeaders: {
        "Content-Type": body.mimeType,
      },
      expiresAt,
      expiresIn: provider === "backblaze_b2" ? 900 : 7200,
    }, 200, request, correlationId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_upload_error";

    console.error(JSON.stringify({
      event: "media_upload_error",
      correlationId,
      code,
    }));

    if (error instanceof B2AuthError) {
      return jsonResponse({
        code: "b2_auth_error",
        message: "As credenciais do armazenamento de media não são válidas ou não têm permissão.",
        retry: false,
        correlationId,
      }, 500, request, correlationId);

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
      ...(code === "unauthorized" ? {} : { correlationId }),
    }, code === "unauthorized" ? 401 : 400, request, correlationId);
  }
});
