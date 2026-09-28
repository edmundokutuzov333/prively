import { WebhookReceiver } from "npm:livekit-server-sdk@2.19.1";
import { serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);
  try {
    const body = await request.text();
    const receiver = new WebhookReceiver(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"));
    const event = await receiver.receive(body, request.headers.get("Authorization") ?? "");
    const roomName = event.room?.name;
    if (typeof roomName !== "string") return jsonResponse({ ok: true });

    const admin = serviceClient();
    const now = new Date().toISOString();
    if (event.event === "room_started") {
      await admin.from("live_sessions").update({ status: "live", started_at: now }).eq("room_name", roomName);
      await admin.from("call_sessions").update({ status: "active", started_at: now }).eq("room_name", roomName);
    } else if (event.event === "room_finished") {
      await admin.from("live_sessions").update({ status: "ended", ended_at: now }).eq("room_name", roomName);
      await admin.from("call_sessions").update({ status: "ended", ended_at: now }).eq("room_name", roomName);
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "webhook_error";
    return jsonResponse({ code }, 401);
  }
});
