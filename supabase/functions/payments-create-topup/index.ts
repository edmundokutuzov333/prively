import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { requiredEnv, updateTopup } from "../_shared/payments.ts";
import { providerAmountToCentavos } from "../_shared/money.ts";
import { getPaymentProvider } from "../_shared/payment-provider.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json() as {
      amount?: unknown;
      method?: unknown;
      idempotencyKey?: unknown;
    };

    if (
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0 ||
      typeof body.method !== "string" ||
      typeof body.idempotencyKey !== "string" ||
      body.idempotencyKey.length < 8 ||
      body.idempotencyKey.length > 128
    ) {
      return jsonResponse({ code: "invalid_topup_request" }, 400);
    }

    const amount = providerAmountToCentavos(body.amount, "major");
    if (amount === null) return jsonResponse({ code: "invalid_amount" }, 400);

    const method = body.method.toLowerCase();

    const { data: intent, error: intentError } = await client.rpc("create_topup_intent", {
      _amount: amount,
      _method: method,
      _idem: body.idempotencyKey,
    });

    if (intentError || !intent) {
      return jsonResponse({ code: intentError?.message ?? "topup_intent_failed" }, 400);
    }

    const admin = serviceClient();
    const { data: topup, error: topupError } = await admin
      .from("topups")
      .select("id,user_id,method,amount,internal_reference,status")
      .eq("id", String(intent.id))
      .single();

    if (topupError || !topup) {
      return jsonResponse({ code: "topup_not_found" }, 500);
    }

    if (topup.status === "paid") {
      return jsonResponse({
        ok: true,
        topupId: topup.id,
        reference: topup.internal_reference,
        status: "paid",
      });
    }

    const provider = getPaymentProvider();
    const providerUnit = Deno.env.get("PAYSUITE_AMOUNT_UNIT") ?? "unverified";

    try {
      const charge = await provider.createCharge({
        reference: topup.internal_reference,
        amount: topup.amount / 100,
        currency: "MZN",
        method: topup.method as "mpesa" | "emola" | "mkesh" | "ponto24" | "card",
        customerContact: user.phone ?? user.email ?? undefined,
        callbackUrl: `${requiredEnv("SUPABASE_URL")}/functions/v1/payments-webhook`,
      });

      await updateTopup(topup.id, {
        provider_ref: charge.providerReference,
        provider_status: charge.providerStatus,
        provider_checkout_url: charge.checkoutUrl,
        status: charge.providerStatus,
        metadata: { provider_response: charge.raw, provider_unit: providerUnit },
        updated_at: new Date().toISOString(),
      });

      return jsonResponse({
        ok: true,
        topupId: topup.id,
        reference: topup.internal_reference,
        providerReference: charge.providerReference,
        status: charge.providerStatus,
        checkoutUrl: charge.checkoutUrl,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "provider_unverified";
      await updateTopup(topup.id, {
        status: "failed",
        failed_at: new Date().toISOString(),
        metadata: { provider_error: code, provider_unit: providerUnit },
      });

      return jsonResponse(
        { code },
        code === "provider_unverified" ? 503 : 502,
      );
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "topup_create_error";
    const status = code === "unauthorized" ? 401 : code === "provider_unverified" ? 503 : 400;
    return jsonResponse({ code }, status);
  }
});
