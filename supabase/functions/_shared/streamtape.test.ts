import { B2UrlExpiredError, StreamtapeAuthError, StreamtapeRejectedError, StreamtapeUnavailableError, embedUrl, mapStreamtapeError } from "./streamtape.ts";

Deno.test("embed URL is validated", () => {
  if (embedUrl("abc_123") !== "https://streamtape.com/e/abc_123") throw new Error("embed_url_mismatch");
  let rejected = false;
  try { embedUrl("bad id"); } catch { rejected = true; }
  if (!rejected) throw new Error("invalid_file_id_accepted");
});

Deno.test("error codes preserve retry semantics", () => {
  const auth = mapStreamtapeError(new StreamtapeAuthError());
  const unavailable = mapStreamtapeError(new StreamtapeUnavailableError());
  const rejected = mapStreamtapeError(new StreamtapeRejectedError());
  const expired = mapStreamtapeError(new B2UrlExpiredError());
  if ((auth as Error & {code?: string}).code !== "streamtape_auth_error") throw new Error("auth_mapping_failed");
  if ((unavailable as Error & {code?: string}).code !== "streamtape_unavailable") throw new Error("unavailable_mapping_failed");
  if ((rejected as Error & {code?: string}).code !== "streamtape_rejected") throw new Error("rejected_mapping_failed");
  if ((expired as Error & {code?: string}).code !== "b2_url_expired") throw new Error("expired_mapping_failed");
  if ((mapStreamtapeError(new StreamtapeRejectedError("provider_message")) as Error & {code?: string}).code !== "streamtape_rejected") throw new Error("rejected_code_contract_failed");
});

Deno.test("HTTP 403 with an expired B2 source is not misclassified as provider auth", async () => {
  const originalFetch = globalThis.fetch;
  const oldLogin = Deno.env.get("STREAMTAPE_API_USERNAME");
  const oldKey = Deno.env.get("STREAMTAPE_API_PASSWORD");

  Deno.env.set("STREAMTAPE_API_USERNAME", "test");
  Deno.env.set("STREAMTAPE_API_PASSWORD", "test");

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: 403, msg: "Request has expired" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

  try {
    let received: unknown = null;
    try {
      const { remoteUpload } = await import("./streamtape.ts");
      await remoteUpload("https://example.invalid/test.mp4");
    } catch (error) {
      received = error;
    }

    if (!(received instanceof B2UrlExpiredError)) {
      throw new Error("b2_expiry_misclassified");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldLogin === undefined) Deno.env.delete("STREAMTAPE_API_USERNAME");
    else Deno.env.set("STREAMTAPE_API_USERNAME", oldLogin);
    if (oldKey === undefined) Deno.env.delete("STREAMTAPE_API_PASSWORD");
    else Deno.env.set("STREAMTAPE_API_PASSWORD", oldKey);
  }
});
