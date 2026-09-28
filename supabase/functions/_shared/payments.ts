import { serviceClient } from "./auth.ts";

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

export function optionalEnv(name: string): string | null {
  return Deno.env.get(name) ?? null;
}

export function assertHttps(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("provider_url_must_be_https");
  return parsed.toString();
}

export function parseProviderJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provider_invalid_response");
  }
  return value as Record<string, unknown>;
}

export function nestedString(body: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    let current: unknown = body;
    for (const key of path.split(".")) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (typeof current === "string" && current.trim()) return current;
    if (typeof current === "number") return String(current);
  }
  return null;
}

export function amountToCentavos(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return normalized.includes(".") ? Math.round(parsed * 100) : parsed;
    }
  }
  return null;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

export async function verifyHmac(
  rawBody: string,
  headerValue: string,
  secret: string,
  mode: "raw" | "timestamp.raw" = "raw",
): Promise<boolean> {
  if (!headerValue) return false;

  let supplied = headerValue.trim();
  let payload = rawBody;

  if (supplied.includes(",")) {
    const parts = Object.fromEntries(
      supplied.split(",").map((part) => {
        const [key, value = ""] = part.split("=", 2);
        return [key.trim(), value.trim()];
      }),
    );
    const timestamp = parts.t ?? parts.timestamp;
    const signature = parts.v1 ?? parts.sig ?? parts.signature;
    if (signature) supplied = signature;
    if (timestamp && mode === "timestamp.raw") payload = `${timestamp}.${rawBody}`;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return safeEqual(digest, supplied);
}

export async function updateTopup(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = serviceClient();
  const { error } = await admin.from("topups").update(patch).eq("id", id);
  if (error) throw new Error(error.message || "topup_update_failed");
}

export async function updatePayout(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = serviceClient();
  const { error } = await admin.from("payouts").update(patch).eq("id", id);
  if (error) throw new Error(error.message || "payout_update_failed");
}
