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
  kycId: z.string().uuid(),
  approved: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});

const kycState = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "review"]),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return respond(request, { code: "method_not_allowed" }, 405);

  try {
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return respond(request, { code: "unauthorized" }, 401);

    const body = schema.parse(await request.json());
    const { data: permitted, error: permissionError } = await client.rpc("has_permission", {
      _uid: authData.user.id,
      _permission: "admin.kyc",
    });

    if (permissionError || permitted !== true) return respond(request, { code: "forbidden" }, 403);

    const { error } = await admin.rpc("approve_kyc", {
      _kyc: body.kycId,
      _approved: body.approved,
      _reason: body.reason ?? null,
      _reviewer: authData.user.id,
    });

    if (error) {
      const code = error.message.split(":")[0].trim();
      return respond(request, { code }, code === "kyc_not_found" ? 404 : code === "forbidden" ? 403 : 422);
    }

    const { data: persisted, error: persistenceError } = await admin
      .from("kyc_verifications")
      .select("id,user_id,status,reviewed_by,reviewed_at")
      .eq("id", body.kycId)
      .maybeSingle();

    if (persistenceError) {
      return respond(request, { code: "kyc_persistence_check_failed" }, 503);
    }

    const expectedStatus = body.approved ? "approved" : "rejected";
    const parsed = persisted ? kycState.safeParse(persisted) : null;

    if (
      !parsed?.success
      || parsed.data.id !== body.kycId
      || parsed.data.status !== expectedStatus
      || parsed.data.reviewed_by !== authData.user.id
    ) {
      return respond(request, { code: "kyc_persistence_mismatch" }, 500);
    }

    return respond(request, { ok: true, status: expectedStatus });
  } catch (error) {
    if (error instanceof z.ZodError) return respond(request, { code: "invalid_kyc_payload" }, 400);
    const code = error instanceof Error ? error.message : "kyc_review_failed";
    return respond(request, { code }, code === "unauthorized" ? 401 : 400);
  }
});
