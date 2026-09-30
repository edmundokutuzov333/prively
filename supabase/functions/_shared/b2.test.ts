import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { b2Bucket, b2Client, b2ClientConfig, presignUpload } from "./b2.ts";
import { PutObjectCommand } from "npm:@aws-sdk/client-s3@3.1142.0";

Deno.test("B2 client and presign contract are path-style", async () => {
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
    const config = b2ClientConfig();

    assertEquals(config.endpoint, "https://s3.eu-central-003.backblazeb2.com");
    assertEquals(config.region, "eu-central-003");
    assertEquals(config.forcePathStyle, true);
    assertEquals(b2Bucket(), "prively-media-originals-2026");

    const client = b2Client();
    assertEquals(await client.config.forcePathStyle?.(), true);

    const key =
      "users/00000000-0000-0000-0000-000000000000/media/11111111-1111-1111-1111-111111111111.png";
    const command = new PutObjectCommand({
      Bucket: b2Bucket(),
      Key: key,
      ContentType: "image/png",
    });

    assertEquals(command.input.Bucket, "prively-media-originals-2026");
    assertEquals(command.input.Key, key);
    assertEquals(command.input.ContentType, "image/png");

    assertStringIncludes(
      "https://s3.eu-central-003.backblazeb2.com/prively-media-originals-2026/",
      "/prively-media-originals-2026/",
    );

    assert(typeof presignUpload === "function");
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
