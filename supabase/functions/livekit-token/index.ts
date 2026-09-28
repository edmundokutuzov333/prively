import { AccessToken, VideoGrant } from "npm:livekit-server-sdk@2.19.1";
import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, requireUuid } from "../_shared/auth.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  try {
    const { client, user } = await requireUser(request);
    const payload = await request.json() as { sessionId?: unknown };
    const sessionId = requireUuid(payload.sessionId);
    const { data, error } = await client.rpc("issue_live_access", { _session: sessionId });
    if (error || !data || typeof data !== "object") return jsonResponse({ code: error?.code ?? "LIVE_ACCESS_DENIED" }, 403);

    const row = data as { room_name?: unknown; role?: unknown; kind?: unknown; mode?: unknown; per_minute_price?: unknown; session_id?: unknown };
    if (typeof row.room_name !== "string" || typeof row.role !== "string" || typeof row.kind !== "string") return jsonResponse({ code: "LIVE_ACCESS_INVALID" }, 500);

    const token = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), { identity: user.id, ttl: "10m" });
    token.addGrant(new VideoGrant({
      room: row.room_name,
      roomJoin: true,
      canPublish: row.role === "host" || row.role === "caller",
      canSubscribe: true,
      canPublishData: false,
    }));

    return new Response(JSON.stringify({
      token: await token.toJwt(),
      url: env("LIVEKIT_URL"),
      sessionId: row.session_id ?? sessionId,
      kind: row.kind,
      mode: row.mode ?? null,
      role: row.role,
      perMinutePrice: row.per_minute_price ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "live_token_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
