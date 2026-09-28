import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const attachmentId = typeof body.attachmentId === "string" ? body.attachmentId : "";
    if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return jsonResponse({ code: "invalid_attachment" }, 400);

    const { data: attachment, error } = await client
      .from("message_attachments")
      .select("id,conversation_id,message_id,owner_id,storage_path,status")
      .eq("id", attachmentId)
      .maybeSingle();

    if (error || !attachment) return jsonResponse({ code: "not_found" }, 404);
    if (attachment.status !== "attached" && attachment.owner_id !== user.id) {
      return jsonResponse({ code: "forbidden" }, 403);
    }

    const admin = serviceClient();
    const { data: signed, error: signedError } = await admin.storage
      .from("prively-chat")
      .createSignedUrl(attachment.storage_path, 60);

    if (signedError || !signed?.signedUrl) return jsonResponse({ code: "signed_url_failed" }, 500);
    return jsonResponse({ url: signed.signedUrl, expiresIn: 60 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "attachment_url_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
