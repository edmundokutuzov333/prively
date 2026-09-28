import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import {
  amountToCentavos,
  assertHttps,
  nestedString,
  parseProviderJson,
  requiredEnv,
  updateTopup,
} from "../_shared/payments.ts";

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

    const amount = Math.round(body.amount * 100);
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

    const createChargeUrl = assertHttps(requiredEnv("PAYSUITE_CREATE_CHARGE_URL"));
    const apiKey = requiredEnv("PAYSUITE_API_KEY");
    const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/payments-webhook`;
    const contact = user.phone ?? user.email ?? undefined;

    if (!contact) {
      return jsonResponse({ code: "payment_contact_required" }, 400);
    }

    const providerResponse = await fetch(createChargeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": topup.internal_reference,
      },
      body: JSON.stringify({
        reference: topup.internal_reference,
        amount: topup.amount / 100,
        currency: "MZN",
        method: topup.method,
        customer_contact: contact,
        callback_url: webhookUrl,
      }),
    });

    const raw = await providerResponse.text();
    let provider: Record<string, unknown>;
    try {
      provider = parseProviderJson(JSON.parse(raw));
    } catch {
      await updateTopup(topup.id, {
        status: "failed",
        failed_at: new Date().toISOString(),
        metadata: { provider_http_status: providerResponse.status },
      });
      return jsonResponse({ code: "provider_invalid_response" }, 502);
    }

    if (!providerResponse.ok) {
      await updateTopup(topup.id, {
        status: "failed",
        failed_at: new Date().toISOString(),
        provider_status: nestedString(provider, ["status", "state", "data.status", "data.state"]),
        metadata: { provider_http_status: providerResponse.status, provider: provider },
      });
      return jsonResponse({ code: "provider_charge_failed" }, 502);
    }

    const providerRef =
      nestedString(provider, [
        "reference",
        "transaction_reference",
        "data.reference",
        "data.transaction_reference",
        "id",
        "data.id",
      ]) ?? topup.internal_reference;

    const providerStatus =
      nestedString(provider, ["status", "state", "data.status", "data.state"]) ?? "pending";

    const checkoutUrl = nestedString(provider, [
      "checkout_url",
      "checkoutUrl",
      "data.checkout_url",
      "data.checkoutUrl",
    ]);

    const reportedAmount = amountToCentavos(
      provider.data && typeof provider.data === "object"
        ? (provider.data as Record<string, unknown>).amount
        : provider.amount,
    );

    if (reportedAmount !== null && reportedAmount !== topup.amount) {
      await updateTopup(topup.id, {
        status: "failed",
        failed_at: new Date().toISOString(),
        metadata: { provider_amount: reportedAmount, expected_amount: topup.amount },
      });
      return jsonResponse({ code: "provider_amount_mismatch" }, 502);
    }

    await updateTopup(topup.id, {
      provider_ref: providerRef,
      provider_status: providerStatus,
      provider_checkout_url: checkoutUrl,
      status: providerStatus === "paid" || providerStatus === "successful" ? "processing" : "pending",
      metadata: { provider_response: provider },
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      topupId: topup.id,
      reference: topup.internal_reference,
      providerReference: providerRef,
      status: providerStatus,
      checkoutUrl,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "topup_create_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
