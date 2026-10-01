import { z } from "npm:zod";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

const schema = z.object({
  kycId: z.string().uuid(),
  approved: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405, request);

  try {
    const { client, user } = await requireUser(request);
    const body = schema.parse(await request.json());

    const { data: permitted, error: permissionError } = await client.rpc("has_permission", {
      _uid: user.id,
      _permission: "admin.kyc",
    });

    if (permissionError || permitted !== true) {
      return jsonResponse({ code: "forbidden" }, 403, request);
    }

    const { error } = await serviceClient().rpc("approve_kyc", {
      _kyc: body.kycId,
      _approved: body.approved,
      _reason: body.reason ?? null,
      _reviewer: user.id,
    });

    if (error) {
      const code = error.message.split(":")[0].trim();
      const status = code === "kyc_not_found" ? 404 : code === "forbidden" ? 403 : 422;
      return jsonResponse({ code }, status, request);
    }

    return jsonResponse({ ok: true, status: body.approved ? "approved" : "rejected" }, 200, request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ code: "invalid_kyc_payload" }, 400, request);
    }
    const code = error instanceof Error ? error.message : "kyc_review_failed";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400, request);
  }
});
