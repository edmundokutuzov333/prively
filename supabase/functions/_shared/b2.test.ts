import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { presignUpload } from "./b2.ts";

Deno.test("B2 presigned PUT is path-style and signs Content-Type", async () => {
  const previous = {
    endpoint: Deno.env.get("B2_ENDPOINT"),
    region: Deno.env.get("B2_REGION"),
    bucket: Deno.env.get("B2_BUCKET_NAME"),
    keyId: Deno.env.get("B2_KEY_ID"),
    appKey: Deno.env.get("B2_APPLICATION_KEY"),
  };

  Deno.env.set("B2_ENDPOINT", "https://s3.eu-central-003.backblazeb2.com");
  Deno.env.set("B2_REGION", "eu-central-003");
  Deno.env.set("B2_BUCKET_NAME", "prively-media-originals-2026");
  Deno.env.set("B2_KEY_ID", "test-key-id");
  Deno.env.set("B2_APPLICATION_KEY", "test-application-key");

  try {
    const url = await presignUpload(
      "users/00000000-0000-0000-0000-000000000000/media/11111111-1111-1111-1111-111111111111.png",
      "image/png",
      900,
    );
    const parsed = new URL(url);

    assert(parsed.hostname === "s3.eu-central-003.backblazeb2.com");
    assertStringIncludes(parsed.pathname, "/prively-media-originals-2026/");
    assertStringIncludes(parsed.searchParams.get("X-Amz-SignedHeaders") ?? "", "content-type");
    assertStringIncludes(parsed.searchParams.get("X-Amz-Expires") ?? "", "900");
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    };
    restore("B2_ENDPOINT", previous.endpoint);
    restore("B2_REGION", previous.region);
    restore("B2_BUCKET_NAME", previous.bucket);
    restore("B2_KEY_ID", previous.keyId);
    restore("B2_APPLICATION_KEY", previous.appKey);
  }
});
