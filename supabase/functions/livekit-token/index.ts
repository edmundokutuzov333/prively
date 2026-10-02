import { AccessToken, VideoGrant } from "npm:livekit-server-sdk@2.19.1";
import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, requireUuid } from "../_shared/auth.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  try {
    const { client, user } = await requireUser(request);
    const payload = await request.json() as { sessionId?: unknown };
    const sessionId = requireUuid(payload.sessionId);
    const { data, error } = await client.rpc("issue_live_access_guarded", { _session: sessionId });
    if (error || !data || typeof data !== "object") return jsonResponse({ code: error?.code ?? "LIVE_ACCESS_DENIED" }, 403, request);

    const row = data as { room_name?: unknown; role?: unknown; kind?: unknown; mode?: unknown; per_minute_price?: unknown; session_id?: unknown };
    if (typeof row.room_name !== "string" || row.room_name.trim() === "" || typeof row.role !== "string" || typeof row.kind !== "string") {
      return jsonResponse({ code: "LIVE_ACCESS_INVALID" }, 500, request);
    }

    const isCall = row.kind === "call";
    const isLiveCreator = row.kind === "live" && row.role === "host";
    const isLiveViewer = row.kind === "live" && row.role === "viewer";
    const isCallParticipant = isCall && (row.role === "caller" || row.role === "host");
    if (!isLiveCreator && !isLiveViewer && !isCallParticipant) {
      return jsonResponse({ code: "LIVE_ACCESS_ROLE_DENIED" }, 403, request);
    }

    const canPublish = isCallParticipant || isLiveCreator;
    const canSubscribe = isCallParticipant || isLiveViewer;
    const token = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), { identity: user.id, ttl: "2m" });
    token.addGrant(new VideoGrant({
      room: row.room_name,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData: canPublish,
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
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400, request);
  }
});
