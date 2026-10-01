import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_env:" + name);
  return value;
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(request),
      "Content-Type": "application/json",
    },
  });
}

function optionsResponse(request: Request): Response {
  return new Response("ok", { headers: corsFor(request) });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") {
    return jsonResponse(request, { code: "method_not_allowed" }, 405);
  }

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization) return jsonResponse(request, { code: "unauthorized" }, 401);

    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) {
      return jsonResponse(request, { code: "unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const shareLocation = body && typeof body.shareLocation === "boolean" ? body.shareLocation : false;
    const locationId = body && typeof body.locationId === "string" && body.locationId.length > 0 ? body.locationId : null;

    const { data: panicId, error: panicError } = await userClient.rpc("create_panic_event", {
      _share_location: shareLocation,
      _location_id: locationId,
    });

    if (panicError || !panicId) {
      return jsonResponse(
        request,
        { code: panicError?.message ?? "panic_create_failed" },
        400,
      );
    }

    const dispatchResponse = await fetch(
      env("SUPABASE_URL") + "/functions/v1/safety-alert-dispatch",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          apikey: env("SUPABASE_ANON_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ panicId }),
      },
    );

    const dispatchBody = await dispatchResponse.json().catch(() => ({}));
    if (!dispatchResponse.ok) {
      return jsonResponse(
        request,
        {
          panicId,
          code: "panic_dispatch_failed",
          dispatchStatus: dispatchResponse.status,
        },
        502,
      );
    }

    return jsonResponse(request, {
      panicId,
      status: typeof dispatchBody?.status === "string" ? dispatchBody.status : "queued",
      supportNotified: dispatchBody?.supportNotified === true,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "panic_trigger_failed";
    return jsonResponse(request, { code }, code === "unauthorized" ? 401 : 400);
  }
});
