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
    const eventId = typeof (event as { id?: unknown }).id === 'string' ? String((event as { id: string }).id) : `${event.event}:${roomName}:${event.createdAt ?? ''}`;
    const { error: eventError } = await admin.from('livekit_events').insert({ event_id: eventId, event_type: event.event, room_name: roomName });
    if (eventError && !eventError.message.toLowerCase().includes('duplicate')) return jsonResponse({ code: 'event_store_failed' }, 500);
    if (eventError?.message.toLowerCase().includes('duplicate')) return jsonResponse({ ok: true, duplicate: true });
    const now = new Date().toISOString();
    if (event.event === "room_started") {
      await admin.from("live_sessions").update({ status: "live", started_at: now }).eq("room_name", roomName);
      await admin.from("call_sessions").update({ status: "active", started_at: now }).eq("room_name", roomName);
    } else if (event.event === "room_finished") {
      await admin.from("live_sessions").update({ status: "ended", ended_at: now }).eq("room_name", roomName);
      await admin.from("call_sessions").update({ status: "ended", ended_at: now }).eq("room_name", roomName);
    } else if (event.event === 'participant_joined' || event.event === 'participant_left') {
      const identity = event.participant?.identity;
      if (typeof identity === 'string' && /^[0-9a-f-]{36}$/i.test(identity)) {
        const session = await admin.from('live_sessions').select('id').eq('room_name', roomName).maybeSingle();
        if (session.data?.id) await admin.from('live_participants').upsert({ session_id: session.data.id, participant_id: identity, joined_at: now, left_at: event.event === 'participant_left' ? now : null, status: event.event === 'participant_left' ? 'left' : 'active' }, { onConflict: 'session_id,participant_id' });
      }
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "webhook_error";
    return jsonResponse({ code }, 401);
  }
});
