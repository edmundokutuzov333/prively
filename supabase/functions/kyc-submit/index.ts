import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_env:" + name);
  return value;
};

const cors = (request: Request): HeadersInit => {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
};

const respond = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors(request) });

const schema = z.object({
  docPath: z.string().min(3).max(512),
  selfiePath: z.string().min(3).max(512),
  docType: z.string().min(2).max(64).default("identity_document"),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return respond(request, { code: "method_not_allowed" }, 405);

  try {
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return respond(request, { code: "unauthorized" }, 401);

    const body = schema.parse(await request.json());
    const { data, error } = await client.rpc("submit_kyc", {
      _doc_path: body.docPath,
      _selfie_path: body.selfiePath,
      _provider: "manual",
      _doc_type: body.docType,
    });

    if (error) {
      const code = error.message.split(":")[0].trim();
      const status = code === "kyc_already_pending" ? 409 : code === "kyc_path_forbidden" ? 403 : 422;
      return respond(request, { code }, status);
    }

    return respond(request, { ok: true, kycId: data, status: "pending" });
  } catch (error) {
    if (error instanceof z.ZodError) return respond(request, { code: "invalid_kyc_payload" }, 400);
    const code = error instanceof Error ? error.message : "kyc_submit_failed";
    return respond(request, { code }, code === "unauthorized" ? 401 : 400);
  }
});
