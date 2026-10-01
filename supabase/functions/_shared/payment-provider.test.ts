import { assertEquals, assertRejects } from "jsr:@std/assert";

import { getPaymentProvider } from "./payment-provider.ts";

Deno.test("manual provider is explicit and never invents a payment", async () => {
  Deno.env.delete("PAYMENTS_PROVIDER");
  const provider = getPaymentProvider();

  await assertRejects(
    () => provider.createCharge({
      reference: "phase5-test",
      amount: 100,
      currency: "MZN",
      method: "mpesa",
      callbackUrl: "https://example.test/webhook",
    }),
    Error,
    "provider_unverified",
  );
});

Deno.test("unknown provider configuration remains blocked", () => {
  Deno.env.set("PAYMENTS_PROVIDER", "unknown-provider");
  try {
    assertEquals(
      (() => {
        try {
          getPaymentProvider();
          return "not_blocked";
        } catch (error) {
          return error instanceof Error ? error.message : "unknown";
        }
      })(),
      "provider_unverified",
    );
  } finally {
    Deno.env.delete("PAYMENTS_PROVIDER");
  }
});
