import webpush from "npm:web-push@3.6.7";
import { serviceClient } from "../_shared/auth.ts";

const json = (body: unknown, status=200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const jobToken = Deno.env.get("PRIVELY_PUSH_JOB_TOKEN");
const vapidSubject = Deno.env.get("VAPID_SUBJECT");
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  if (!jobToken || request.headers.get("x-prively-job-token") !== jobToken) return json({ code: "unauthorized" }, 401);

  const supabase = serviceClient();
  const { data: flag } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "feature_flags.push")
    .maybeSingle();

  if (flag?.value !== true) return new Response(null, { status: 204 });
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) return json({ code: "push_not_configured" }, 503);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: notifications, error: notificationError } = await supabase
    .from("notifications")
    .select("id,user_id,kind,created_at")
    .is("push_delivered_at", null)
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(100);

  if (notificationError) return json({ code: "notifications_load_failed" }, 500);
  if (!notifications?.length) return json({ processed: 0 });

  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,preferences,quiet_start,quiet_end,discreet_mode")
      .eq("user_id", notification.user_id)
      .eq("enabled", true);

    if (!subscriptions?.length) continue;

    let delivered = false;

    for (const subscription of subscriptions) {
      const preferences = subscription.preferences && typeof subscription.preferences === 'object' ? subscription.preferences as Record<string, unknown> : {};
      const category = notification.kind === 'message' ? 'messages' : notification.kind === 'live' ? 'lives' : notification.kind === 'money' ? 'money' : 'news';
      if (preferences[category] === false || preferences.all === false) continue;
      const payload = JSON.stringify({
        title: subscription.discreet_mode ? "Actividade" : "Prively",
        body: notification.kind === "message" ? "Tens uma nova mensagem" : notification.kind === 'live' ? "Há actividade numa transmissão" : "Tens uma nova actividade",
        url: "/notificacoes",
        tag: "prively-neutral",
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60, urgency: "normal" },
        );
        delivered = true;
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", subscription.id);
        }
      }
    }

    if (delivered) {
      await supabase
        .from("notifications")
        .update({ push_delivered_at: new Date().toISOString() })
        .eq("id", notification.id)
        .is("push_delivered_at", null);
    }
  }

  return json({ processed: notifications.length, sent, failed });
});
