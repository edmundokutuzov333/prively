import { createClient } from "npm:@supabase/supabase-js@2";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_env:" + name);
  return value;
}

export function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(request: Request) {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");
  return { client, user: data.user };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    },
  });

export const optionsResponse = () =>
  new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

import { requireUser, serviceClient } from "../_shared/auth.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((n) => n.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const admin = serviceClient();
    const body = await request.json().catch(() => ({}));
    const panicId = typeof body.panicId === "string" ? body.panicId : "";

    if (!/^[0-9a-f-]{36}$/i.test(panicId)) return jsonResponse({ code: "invalid_panic" }, 400);

    const { data: panic } = await admin
      .from("panic_events")
      .select("id,user_id,share_location,location_id,alert_status,created_at")
      .eq("id", panicId)
      .maybeSingle();

    if (!panic) return jsonResponse({ code: "panic_not_found" }, 404);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const staff = Boolean(roles?.some((row) => ["support", "moderator", "compliance", "admin"].includes(String(row.role))));
    if (panic.user_id !== user.id && !staff) return jsonResponse({ code: "forbidden" }, 403);

    const { data: flag } = await admin.from("platform_settings").select("value").eq("key", "feature_flags.safety_alerts").maybeSingle();
    const enabled = flag?.value === true;
    const webhookUrl = Deno.env.get("SAFETY_ALERT_WEBHOOK_URL");
    const webhookSecret = Deno.env.get("SAFETY_ALERT_WEBHOOK_SECRET");

    const { data: contacts } = await admin
      .from("trusted_contacts")
      .select("id,display_name,phone")
      .eq("user_id", panic.user_id)
      .not("verified_at", "is", null);

    let location: { latitude: number; longitude: number } | null = null;
    if (panic.share_location && panic.location_id) {
      const { data: locationRow } = await admin
        .from("safety_location_shares")
        .select("latitude,longitude,expires_at,purged_at")
        .eq("id", panic.location_id)
        .maybeSingle();
      if (locationRow && !locationRow.purged_at && new Date(locationRow.expires_at).getTime() > Date.now()) {
        location = { latitude: Number(locationRow.latitude), longitude: Number(locationRow.longitude) };
      }
    }

    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["support", "moderator", "admin"]);

    for (const row of staffRoles ?? []) {
      await admin.from("notifications").insert({
        user_id: row.user_id,
        kind: "safety_alert",
        payload: {
          event: "panic",
          panic_id: panic.id,
          created_at: panic.created_at,
          location_shared: Boolean(location),
        },
      });
    }

    if (!enabled || !webhookUrl || !webhookSecret || !contacts?.length) {
      await admin.from("panic_events").update({
        alert_status: "not_configured",
        support_notified_at: new Date().toISOString(),
      }).eq("id", panic.id);
      return jsonResponse({ status: "not_configured", supportNotified: true, contacts: 0 });
    }

    let sent = 0;
    for (const contact of contacts) {
      const payload = JSON.stringify({
        event: "prively_safety_alert",
        to: contact.phone,
        name: contact.display_name,
        created_at: panic.created_at,
        location,
        message: "Alerta de segurança Prively. Um contacto de confiança precisa de atenção.",
      });
      const signature = await signBody(payload, webhookSecret);
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prively-signature": signature,
        },
        body: payload,
      });
      if (response.ok) sent += 1;
    }

    await admin.from("panic_events").update({
      alert_status: sent === contacts.length ? "sent" : sent > 0 ? "partial" : "failed",
      support_notified_at: new Date().toISOString(),
      contacts_notified_at: sent > 0 ? new Date().toISOString() : null,
    }).eq("id", panic.id);

    return jsonResponse({
      status: sent === contacts.length ? "sent" : sent > 0 ? "partial" : "failed",
      supportNotified: true,
      contacts: sent,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "safety_alert_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
