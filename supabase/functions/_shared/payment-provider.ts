export type PaymentChargeRequest = {
  reference: string;
  amount: number;
  currency: "MZN";
  method: "mpesa" | "emola" | "mkesh" | "ponto24" | "card";
  customerContact?: string;
  callbackUrl: string;
};

export type PaymentChargeResult = {
  providerReference: string;
  providerStatus: "pending" | "processing" | "paid";
  checkoutUrl: string | null;
  raw: Record<string, unknown>;
};

export interface PaymentProvider {
  createCharge(input: PaymentChargeRequest): Promise<PaymentChargeResult>;
}

/**
 * Manual is the only provider adapter enabled until the real provider contract,
 * authentication scheme, amount unit and sandbox are confirmed in writing.
 */
class ManualPaymentProvider implements PaymentProvider {
  async createCharge(): Promise<PaymentChargeResult> {
    throw new Error("provider_unverified");
  }
}

export function getPaymentProvider(): PaymentProvider {
  const provider = (Deno.env.get("PAYMENTS_PROVIDER") ?? "manual").trim().toLowerCase();
  if (provider === "manual") return new ManualPaymentProvider();
  throw new Error("provider_unverified");
}
