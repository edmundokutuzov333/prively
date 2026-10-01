import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/auth.ts";
import {
  nestedString,
  parseProviderJson,
  requiredEnv,
  verifyHmac,
} from "../_shared/payments.ts";
import { amountUnit, providerAmountToCentavos } from "../_shared/money.ts";

function normalizeStatus(value: string | null): "paid" | "failed" | "pending" | "processing" | "cancelled" | "expired" | "reversed" | null {
  const normalized = (value ?? "").toLowerCase();
  if (["paid", "successful", "success", "completed", "payment.succeeded"].includes(normalized)) return "paid";
  if (["failed", "failure", "declined", "payment.failed"].includes(normalized)) return "failed";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (["expired", "timeout"].includes(normalized)) return "expired";
  if (["processing", "in_progress"].includes(normalized)) return "processing";
  if (["reversed", "reversal"].includes(normalized)) return "reversed";
  if (["pending", "created"].includes(normalized)) return "pending";
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  const rawBody = await request.text();
  const signatureHeader = Deno.env.get("PAYSUITE_SIGNATURE_HEADER") ?? "x-signature";
  const eventHeader = Deno.env.get("PAYSUITE_EVENT_ID_HEADER") ?? "x-event-id";
  const eventTypeHeader = Deno.env.get("PAYSUITE_EVENT_HEADER") ?? "x-event";
  const signature = request.headers.get(signatureHeader) ?? request.headers.get(signatureHeader.toLowerCase()) ?? "";
  const eventId =
    request.headers.get(eventHeader) ??
    request.headers.get(eventHeader.toLowerCase()) ??
    request.headers.get("x-paysuite-event-id") ??
    await sha256Hex(rawBody);
  const headerEvent =
    request.headers.get(eventTypeHeader) ??
    request.headers.get(eventTypeHeader.toLowerCase());

  let payload: Record<string, unknown>;
  try {
    payload = parseProviderJson(JSON.parse(rawBody));
  } catch {
    return jsonResponse({ code: "invalid_json" }, 400);
  }

  const eventType =
    headerEvent ??
    nestedString(payload, ["event", "type", "data.event", "data.type"]) ??
    "unknown";

  const admin = serviceClient();
  let amountUnitValue: ReturnType<typeof amountUnit>;
  try {
    const secret = requiredEnv("PAYSUITE_WEBHOOK_SECRET");
    const mode = (Deno.env.get("PAYSUITE_HMAC_MODE") ?? "raw") as "raw" | "timestamp.raw";
    const signatureResult = await verifyHmac(rawBody, signature, secret, mode);
    if (!signatureResult.valid) return jsonResponse({ code: "invalid_signature" }, 401);
    if (mode === "timestamp.raw" && (!signatureResult.timestamp || Math.abs(Math.floor(Date.now() / 1000) - signatureResult.timestamp) > 300)) return jsonResponse({ code: "signature_expired" }, 401);
    amountUnitValue = amountUnit();
  } catch (error) {
    const code = error instanceof Error ? error.message : "provider_not_configured";
    return jsonResponse({ code }, code.startsWith('missing_env:') ? 503 : 401);
  }

  const { data: existingEvent, error: existingEventError } = await admin
    .from("payment_webhook_events")
    .select("id,status")
    .eq("provider", "paysuite")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEventError) return jsonResponse({ code: "webhook_event_lookup_failed" }, 500);
  if (existingEvent?.status === "processed") return jsonResponse({ ok: true, duplicate: true });

  if (!existingEvent) {
    const { error: insertError } = await admin
      .from("payment_webhook_events")
      .insert({
        provider: "paysuite",
        event_id: eventId,
        event_type: eventType,
        signature_valid: true,
        provider_ref: nestedString(payload, [
          "reference",
          "transaction_reference",
          "data.reference",
          "data.transaction_reference",
          "data.id",
        ]),
        raw_body: rawBody,
        payload,
        status: "received",
      });

    if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
      return jsonResponse({ code: "webhook_event_store_failed" }, 500);
    }
  }

  const eventLower = eventType.toLowerCase();
  const data =
    payload.data && typeof payload.data === "object"
      ? payload.data as Record<string, unknown>
      : payload;

  const providerRef = nestedString(payload, [
    "reference",
    "transaction_reference",
    "provider_ref",
    "data.reference",
    "data.transaction_reference",
    "data.provider_ref",
  ]);

  const providerTransactionId = nestedString(payload, [
    "provider_transaction_id",
    "transaction_id",
    "data.provider_transaction_id",
    "data.transaction_id",
  ]);

  const status = normalizeStatus(
    nestedString(payload, ["status", "state", "data.status", "data.state"]) ??
      (eventLower.includes("succeeded") ? "paid" : eventLower.includes("failed") ? "failed" : null),
  );

  try {
    if (eventLower.includes("payout")) {
      if (!providerRef) throw new Error("payout_reference_missing");

      const { data: payout, error: payoutError } = await admin
        .from("payouts")
        .select("id,amount,status")
        .eq("provider_ref", providerRef)
        .maybeSingle();

      if (payoutError) throw new Error("payout_lookup_failed");
      if (!payout) throw new Error("payout_not_found");

      const payoutStatus = status === "paid" ? "paid" : status === "failed" ? "failed" : null;
      if (!payoutStatus) {
        await admin
          .from("payment_webhook_events")
          .update({ status: "processed", processed_at: new Date().toISOString() })
          .eq("provider", "paysuite")
          .eq("event_id", eventId);
        return jsonResponse({ ok: true, ignored: true });
      }

      const { error: rpcError } = payoutStatus === "paid"
        ? await admin.rpc("finalize_payout_paid", {
            _payout: payout.id,
            _provider_ref: providerRef,
            _provider_transaction_id: providerTransactionId,
          })
        : await admin.rpc("finalize_payout_failed", {
            _payout: payout.id,
            _reason: nestedString(payload, ["failure_reason", "message", "data.failure_reason", "data.message"]) ?? "provider_failed",
          });

      if (rpcError) throw new Error(rpcError.message);

      await admin
        .from("payment_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("provider", "paysuite")
        .eq("event_id", eventId);

      return jsonResponse({ ok: true });
    }

    if (!providerRef) throw new Error("topup_reference_missing");
    const amount = providerAmountToCentavos(
      data.amount ?? data.value ?? payload.amount ?? payload.value,
      amountUnitValue,
    );
    if (amount === null) throw new Error("topup_amount_missing");
    if (!status) throw new Error("topup_status_unknown");

    const { error: rpcError } = await admin.rpc("credit_topup", {
      _provider_ref: providerRef,
      _status: status,
      _amount: amount,
      _provider_transaction_id: providerTransactionId,
    });

    if (rpcError) throw new Error(rpcError.message);

    await admin
      .from("payment_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("provider", "paysuite")
      .eq("event_id", eventId);

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_processing_failed";
    const permanent = ["unknown_topup", "amount_mismatch", "topup_not_payable", "topup_balance_limit_exceeded", "unsupported_topup_status", "topup_reference_missing", "topup_amount_missing", "topup_status_unknown", "invalid_amount_format", "invalid_amount", "payout_not_found", "payout_reference_missing"].some((code) => message.includes(code));
    if (permanent) {
      await admin.from("payment_webhook_events").update({ status: "quarantined", error_message: message }).eq("provider", "paysuite").eq("event_id", eventId);
      await admin.from('financial_alerts').insert({ kind: 'payment_webhook_quarantined', severity: 'high', message, metadata: { eventId, providerRef } });
      return jsonResponse({ ok: true, quarantined: true });
    }
    await admin.from("payment_webhook_events").update({ status: "failed", error_message: message }).eq("provider", "paysuite").eq("event_id", eventId);
    return jsonResponse({ code: message }, 500);
  }
});
