import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const admin = serviceClient();

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (roleError || !roleRows?.some((row) => ["moderator", "compliance", "admin"].includes(String(row.role)))) {
      return jsonResponse({ code: "forbidden" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const queueId = textValue(body.queueId);
    if (!/^[0-9a-f-]{36}$/i.test(queueId)) return jsonResponse({ code: "invalid_queue" }, 400);

    const { data: flag } = await admin.from("platform_settings").select("value").eq("key", "feature_flags.ai_moderation").maybeSingle();
    if (flag?.value !== true) {
      await admin.from("moderation_queue").update({ ai_status: "unavailable", updated_at: new Date().toISOString() }).eq("id", queueId);
      return jsonResponse({ code: "ai_moderation_disabled" }, 503);
    }

    const endpoint = Deno.env.get("MODERATION_API_URL");
    const apiKey = Deno.env.get("MODERATION_API_KEY");
    if (!endpoint || !apiKey) {
      await admin.from("moderation_queue").update({ ai_status: "unavailable", updated_at: new Date().toISOString() }).eq("id", queueId);
      return jsonResponse({ code: "moderation_provider_not_configured" }, 503);
    }

    const { data: queue, error: queueError } = await admin
      .from("moderation_queue")
      .select("id,report_id,post_id,asset_id,message_id,status")
      .eq("id", queueId)
      .maybeSingle();

    if (queueError || !queue) return jsonResponse({ code: "queue_not_found" }, 404);

    let sourceText = "";
    let sourceUrl: string | null = null;

    if (queue.report_id) {
      const { data: report } = await admin
        .from("reports")
        .select("reason_code,details,target_type,target_id")
        .eq("id", queue.report_id)
        .maybeSingle();
      if (report) sourceText += report.reason_code + "\n" + (report.details ?? "");
    }

    if (queue.post_id) {
      const { data: post } = await admin
        .from("posts")
        .select("caption")
        .eq("id", queue.post_id)
        .maybeSingle();
      sourceText += "\n" + (post?.caption ?? "");
    }

    if (queue.message_id) {
      const { data: message } = await admin
        .from("messages")
        .select("body")
        .eq("id", queue.message_id)
        .maybeSingle();
      sourceText += "\n" + (message?.body ?? "");
    }

    if (queue.asset_id) {
      const { data: asset } = await admin
        .from("media_assets")
        .select("storage_path")
        .eq("id", queue.asset_id)
        .maybeSingle();
      if (asset?.storage_path) {
        const signed = await admin.storage.from("prively-private").createSignedUrl(asset.storage_path, 120);
        if (!signed.error && signed.data?.signedUrl) sourceUrl = signed.data.signedUrl;
      }
    }

    await admin.from("moderation_queue").update({ ai_status: "running", updated_at: new Date().toISOString() }).eq("id", queueId);

    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        text: sourceText.slice(0, 16000),
        media_url: sourceUrl,
        queue_id: queueId,
      }),
    });

    if (!providerResponse.ok) {
      await admin.from("moderation_queue").update({ ai_status: "error", updated_at: new Date().toISOString() }).eq("id", queueId);
      return jsonResponse({ code: "moderation_provider_failed" }, 502);
    }

    const result = await providerResponse.json();
    const decision = String(result.status ?? result.decision ?? "").toLowerCase();
    const flagged = ["flagged", "unsafe", "blocked"].includes(decision);
    const clean = ["clean", "safe", "approved"].includes(decision);

    if (!flagged && !clean) {
      await admin.from("moderation_queue").update({ ai_status: "error", updated_at: new Date().toISOString() }).eq("id", queueId);
      return jsonResponse({ code: "moderation_provider_invalid" }, 502);
    }

    const score = asScore(result.score);
    const categories = Array.isArray(result.categories) ? result.categories.slice(0, 50) : [];

    await admin.from("moderation_queue").update({
      ai_status: flagged ? "flagged" : "clean",
      ai_categories: categories,
      ai_score: score,
      status: flagged ? "in_review" : queue.status,
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);

    if (flagged) {
      if (queue.post_id) await admin.from("posts").update({ status: "removed" }).eq("id", queue.post_id);
      if (queue.asset_id) await admin.from("media_assets").update({ moderation_status: "flagged", processing_status: "blocked" }).eq("id", queue.asset_id);
      if (queue.report_id) await admin.from("reports").update({ status: "triaged", updated_at: new Date().toISOString() }).eq("id", queue.report_id);
    }

    await admin.from("audit_log").insert({
      actor_id: user.id,
      event_type: "ai_moderation_completed",
      target_type: "moderation_queue",
      target_id: queueId,
      reason: flagged ? "ai_flagged" : "ai_clean",
      metadata: { score, categories },
    });

    return jsonResponse({ queueId, status: flagged ? "flagged" : "clean", score, categories });
  } catch (error) {
    const code = error instanceof Error ? error.message : "moderation_scan_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
