import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, requireUuid } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  try {
    const { client } = await requireUser(request);
    const payload = await request.json() as { event?: unknown; properties?: unknown; channelId?: unknown };
    if (typeof payload.event !== "string" || payload.event.trim().length<1 || payload.event.trim().length>100) return jsonResponse({ code: "invalid_event" }, 400);
    const properties = payload.properties === undefined ? {} : payload.properties;
    if (typeof properties !== "object" || properties===null || Array.isArray(properties)) return jsonResponse({ code: "invalid_properties" }, 400);
    const channelId = payload.channelId===undefined || payload.channelId===null ? null : requireUuid(payload.channelId);
    if (JSON.stringify(properties).length>10000) return jsonResponse({ code: "properties_too_large" }, 413);
    const { data, error } = await client.rpc("record_analytics_event", { _event: payload.event.trim(), _properties: properties, _channel: channelId });
    if (error) return jsonResponse({ code: error.code ?? "analytics_failed" }, 400);
    return jsonResponse({ id: data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "analytics_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
