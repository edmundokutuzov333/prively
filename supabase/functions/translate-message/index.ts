import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const language = typeof body.language === "string" ? body.language.trim().slice(0, 12) : "";
    if (!/^[0-9a-f-]{36}$/i.test(messageId) || !/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,8})?$/.test(language)) {
      return jsonResponse({ code: "invalid_translation_request" }, 400);
    }

    const admin = serviceClient();
    const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "feature_flags.translation").maybeSingle();
    if (setting?.value !== true) return jsonResponse({ code: "translation_not_configured" }, 503);

    if ((Deno.env.get("TRANSLATION_APPROVED") ?? "").toLowerCase() !== "true") {
      return jsonResponse({ code: "translation_provider_not_approved" }, 503);
    }

    const { data: message, error } = await client
      .from("messages")
      .select("id,conversation_id,sender_id,body,price,kind")
      .eq("id", messageId)
      .maybeSingle();

    if (error || !message) return jsonResponse({ code: "message_not_found" }, 404);
    if (!message.body || !["text", "system"].includes(message.kind)) return jsonResponse({ code: "message_not_translatable" }, 400);

    const { data: membership } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", message.conversation_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return jsonResponse({ code: "forbidden" }, 403);

    if (
      message.price !== null &&
      message.sender_id !== user.id
    ) {
      const { data: unlock } = await client
        .from("message_unlocks")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!unlock) return jsonResponse({ code: "message_locked" }, 403);
    }

    const { data: cached } = await client
      .from("message_translations")
      .select("translated_body,provider")
      .eq("message_id", messageId)
      .eq("language", language)
      .maybeSingle();

    if (cached) return jsonResponse({ translation: cached.translated_body, provider: cached.provider, cached: true });

    const endpoint = requiredSecret("TRANSLATION_API_URL");
    const apiKey = requiredSecret("TRANSLATION_API_KEY");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ text: message.body, target_language: language }),
    });

    if (!response.ok) return jsonResponse({ code: "translation_provider_failed" }, 502);
    const providerPayload = await response.json();
    const translation =
      typeof providerPayload.translation === "string"
        ? providerPayload.translation
        : providerPayload.data && typeof providerPayload.data.translation === "string"
          ? providerPayload.data.translation
          : null;

    if (!translation) return jsonResponse({ code: "translation_provider_invalid" }, 502);

    const provider = Deno.env.get("TRANSLATION_PROVIDER") ?? "configured-provider";
    await admin.from("message_translations").upsert({
      message_id: messageId,
      language,
      translated_body: translation,
      provider,
    }, { onConflict: "message_id,language" });

    return jsonResponse({ translation, provider, cached: false });
  } catch (error) {
    const code = error instanceof Error ? error.message : "translation_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
