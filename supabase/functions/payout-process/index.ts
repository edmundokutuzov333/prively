import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import {
  assertHttps,
  nestedString,
  parseProviderJson,
  requiredEnv,
  updatePayout,
} from "../_shared/payments.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client } = await requireUser(request);
    const body = await request.json() as { payoutId?: unknown };

    if (typeof body.payoutId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.payoutId)) {
      return jsonResponse({ code: "invalid_payout_id" }, 400);
    }

    const { data: payoutPayload, error: accessError } = await client.rpc(
      "get_payout_execution_payload",
      { _payout: body.payoutId },
    );

    if (accessError || !payoutPayload) {
      return jsonResponse({ code: accessError?.message ?? "payout_execution_forbidden" }, 403);
    }

    const payout = payoutPayload as {
      id: string;
      owner_id: string;
      amount: number;
      method: string;
      destination: string;
    };

    const payoutUrl = assertHttps(requiredEnv("PAYSUITE_PAYOUT_URL"));
    const apiKey = requiredEnv("PAYSUITE_API_KEY");
    const response = await fetch(payoutUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `payout:${payout.id}`,
      },
      body: JSON.stringify({
        reference: payout.id,
        amount: payout.amount / 100,
        currency: "MZN",
        method: payout.method,
        destination: JSON.parse(payout.destination),
      }),
    });

    const raw = await response.text();
    let provider: Record<string, unknown>;
    try {
      provider = parseProviderJson(JSON.parse(raw));
    } catch {
      await updatePayout(payout.id, {
        status: "approved",
        failure_reason: "provider_invalid_response",
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ code: "provider_invalid_response" }, 502);
    }

    if (!response.ok) {
      await updatePayout(payout.id, {
        status: "approved",
        failure_reason: nestedString(provider, ["message", "error", "data.message"]) ?? "provider_payout_failed",
        metadata: { provider_http_status: response.status, provider_response: provider },
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ code: "provider_payout_failed" }, 502);
    }

    const providerRef = nestedString(provider, [
      "reference",
      "transaction_reference",
      "data.reference",
      "data.transaction_reference",
      "id",
      "data.id",
    ]);

    const providerTransactionId = nestedString(provider, [
      "provider_transaction_id",
      "transaction_id",
      "data.provider_transaction_id",
      "data.transaction_id",
    ]);

    const state = (nestedString(provider, ["status", "state", "data.status", "data.state"]) ?? "processing").toLowerCase();
    const admin = serviceClient();

    if (["paid", "successful", "success", "completed"].includes(state)) {
      const { error } = await admin.rpc("finalize_payout_paid", {
        _payout: payout.id,
        _provider_ref: providerRef,
        _provider_transaction_id: providerTransactionId,
      });
      if (error) throw new Error(error.message);

      return jsonResponse({
        ok: true,
        payoutId: payout.id,
        status: "paid",
        providerReference: providerRef,
      });
    }

    if (["failed", "declined", "cancelled", "canceled"].includes(state)) {
      const { error } = await admin.rpc("finalize_payout_failed", {
        _payout: payout.id,
        _reason: nestedString(provider, ["message", "error", "data.message"]) ?? "provider_failed",
      });
      if (error) throw new Error(error.message);

      return jsonResponse({
        ok: false,
        payoutId: payout.id,
        status: "failed",
        providerReference: providerRef,
      }, 502);
    }

    await updatePayout(payout.id, {
      status: "processing",
      provider_ref: providerRef,
      provider_transaction_id: providerTransactionId,
      failure_reason: null,
      metadata: { provider_response: provider },
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      payoutId: payout.id,
      status: "processing",
      providerReference: providerRef,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "payout_process_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
