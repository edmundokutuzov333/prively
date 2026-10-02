import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_env_" + name);
  return value;
};

const schema = z.object({
  docPath: z.string().min(3).max(512),
  selfiePath: z.string().min(3).max(512),
  docType: z.string().min(2).max(64).default("identity_document"),
  locale: z.string().min(2).max(12).default("pt-MZ"),
});

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ code: "unauthorized" }, 401);

    const body = schema.parse(await request.json());
    const providerConfigured = Boolean(
      Deno.env.get("KYC_START_URL")
      && Deno.env.get("KYC_API_KEY")
      && Deno.env.get("KYC_WEBHOOK_SECRET"),
    );

    if (!providerConfigured) {
      const { data, error } = await client.rpc("submit_kyc", {
        _doc_path: body.docPath,
        _selfie_path: body.selfiePath,
        _provider: "manual",
        _doc_type: body.docType,
      });

      if (error) {
        const code = error.message.split(":")[0].trim();
        const status = code === "kyc_already_pending" ? 409 : code === "kyc_path_forbidden" ? 403 : 422;
        return json({ code }, status);
      }

      return json({ ok: true, mode: "manual", kycId: data, status: "pending" }, 200);
    }

    const response = await fetch(env("KYC_START_URL"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + env("KYC_API_KEY"),
      },
      body: JSON.stringify({ userId: authData.user.id, locale: body.locale }),
    });

    if (!response.ok) return json({ code: "kyc_provider_unavailable" }, 503);
    const providerBody = await response.json() as { url?: unknown; providerRef?: unknown };
    if (typeof providerBody.url !== "string" || typeof providerBody.providerRef !== "string") {
      return json({ code: "kyc_provider_invalid_response" }, 502);
    }

    return json({ ok: true, mode: "provider", url: providerBody.url, providerRef: providerBody.providerRef }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ code: "invalid_kyc_payload" }, 400);
    const code = error instanceof Error ? error.message : "kyc_start_failed";
    return json({ code }, code === "unauthorized" ? 401 : 503);
  }
});
