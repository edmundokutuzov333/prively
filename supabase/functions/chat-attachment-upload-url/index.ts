import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

const MAX_SIZE = 25_000_000;
const mimeToKind = (mime: string) => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const fileSize = Number(body.fileSize);
    const fileName = typeof body.fileName === "string" ? body.fileName : "attachment";
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return jsonResponse({ code: "invalid_conversation" }, 400);
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_SIZE) return jsonResponse({ code: "file_too_large" }, 400);

    const kind = mimeToKind(mimeType);
    if (!kind) return jsonResponse({ code: "unsupported_media_type" }, 415);

    const { error: rateError } = await client.rpc("assert_chat_rate_limit", { _is_attachment: true });
    if (rateError) return jsonResponse({ code: rateError.code ?? rateError.message }, 429);

    const { data: conversation, error: conversationError } = await client
      .from("conversations")
      .select("id,client_id,creator_id,channel_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) return jsonResponse({ code: "forbidden" }, 403);
    if (conversation.client_id !== user.id && conversation.creator_id !== user.id) {
      return jsonResponse({ code: "forbidden" }, 403);
    }

    const admin = serviceClient();
    const { data: blocked } = await admin.rpc("is_blocked", {
      _a: conversation.client_id,
      _b: conversation.creator_id,
    });
    if (blocked) return jsonResponse({ code: "user_blocked" }, 403);

    const extension = mimeType.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const attachmentId = crypto.randomUUID();
    const storagePath = `${conversationId}/${attachmentId}-${safeName || "attachment"}.${extension}`;

    const { error: insertError } = await admin.from("message_attachments").insert({
      id: attachmentId,
      conversation_id: conversationId,
      owner_id: user.id,
      storage_path: storagePath,
      kind,
      mime_type: mimeType,
      file_size: fileSize,
      status: "pending",
    });
    if (insertError) return jsonResponse({ code: "attachment_create_failed" }, 500);

    const { data: signed, error: signedError } = await admin.storage
      .from("prively-chat")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signed?.token) {
      await admin.from("message_attachments").update({ status: "failed" }).eq("id", attachmentId);
      return jsonResponse({ code: "signed_upload_failed" }, 500);
    }

    return jsonResponse({
      attachmentId,
      path: storagePath,
      token: signed.token,
      kind,
      mimeType,
      fileSize,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "attachment_upload_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
