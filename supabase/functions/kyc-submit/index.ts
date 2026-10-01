import { z } from "npm:zod";
import { requireUser } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

const schema = z.object({
  docPath: z.string().min(3).max(512),
  selfiePath: z.string().min(3).max(512),
  docType: z.string().min(2).max(64).default("identity_document"),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405, request);

  try {
    const { client } = await requireUser(request);
    const body = schema.parse(await request.json());
    const { data, error } = await client.rpc("submit_kyc", {
      _doc_path: body.docPath,
      _selfie_path: body.selfiePath,
      _provider: "manual",
      _doc_type: body.docType,
    });

    if (error) {
      const code = error.message.split(":")[0].trim();
      const status =
        code === "unauthorized" ? 401 :
        code === "kyc_already_pending" ? 409 :
        code === "kyc_path_forbidden" ? 403 :
        code === "kyc_provider_unverified" ? 422 :
        422;
      return jsonResponse({ code }, status, request);
    }

    return jsonResponse({ ok: true, kycId: data, status: "pending" }, 200, request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ code: "invalid_kyc_payload" }, 400, request);
    }
    const code = error instanceof Error ? error.message : "kyc_submit_failed";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400, request);
  }
});
