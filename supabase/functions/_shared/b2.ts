import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "npm:@aws-sdk/client-s3@3.1142.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1142.0";

export type MediaBackend = "supabase" | "b2" | "both";

export class B2ObjectNotFoundError extends Error {
  readonly code = "b2_object_not_found";
  constructor(message = "The requested object does not exist in Backblaze B2.") {
    super(message);
    this.name = "B2ObjectNotFoundError";
  }
}

export class B2UnavailableError extends Error {
  readonly code = "b2_unavailable";
  constructor(message = "Backblaze B2 is temporarily unavailable.") {
    super(message);
    this.name = "B2UnavailableError";
  }
}

export class B2ConfigurationError extends Error {
  readonly code = "b2_configuration_error";
  constructor(message: string) {
    super(message);
    this.name = "B2ConfigurationError";
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new B2ConfigurationError(`missing_env:${name}`);
  return value;
}

function b2Endpoint(): string {
  const endpoint = env("B2_ENDPOINT");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new B2ConfigurationError("b2_endpoint_invalid");
  }
  if (url.protocol !== "https:") throw new B2ConfigurationError("b2_endpoint_must_be_https");
  return url.toString().replace(/\/$/, "");
}

export function mediaBackend(): MediaBackend {
  const value = (Deno.env.get("MEDIA_BACKEND") ?? "b2").trim().toLowerCase();
  if (value === "supabase" || value === "b2" || value === "both") return value;
  throw new B2ConfigurationError("invalid_media_backend");
}

export function b2Bucket(): string {
  return Deno.env.get("B2_BUCKET_NAME")?.trim() || "prively-media-originals-2026";
}

export function b2ClientConfig(): S3ClientConfig {
  return {
    region: env("B2_REGION"),
    endpoint: b2Endpoint(),
    credentials: {
      accessKeyId: env("B2_KEY_ID"),
      secretAccessKey: env("B2_APPLICATION_KEY"),
    },
    forcePathStyle: true,
  };
}

export function b2Client(): S3Client {
  return new S3Client(b2ClientConfig());
}

function mapB2Error(error: unknown): Error {
  const status = typeof error === "object" && error !== null && "$metadata" in error
    ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)
    : 0;

  if (status === 404 || (error instanceof Error && /not.?found|nosuchkey/i.test(error.message))) {
    return new B2ObjectNotFoundError();
  }

  if (status >= 500 || status === 429 || status === 0) {
    return new B2UnavailableError();
  }

  return error instanceof Error ? error : new Error("b2_request_failed");
}

export async function assertB2ObjectExists(key: string): Promise<void> {
  try {
    await b2Client().send(new HeadObjectCommand({
      Bucket: b2Bucket(),
      Key: key,
    }));
  } catch (error) {
    throw mapB2Error(error);
  }
}

export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 15 * 60,
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: b2Bucket(),
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(b2Client(), command, {
      expiresIn,
      signableHeaders: new Set(["content-type"]),
    });
  } catch (error) {
    throw mapB2Error(error);
  }
}

export async function presignDownload(
  key: string,
  expiresIn = 60,
): Promise<string> {
  await assertB2ObjectExists(key);

  try {
    const command = new GetObjectCommand({
      Bucket: b2Bucket(),
      Key: key,
      ResponseContentDisposition: "inline",
    });

    return await getSignedUrl(b2Client(), command, { expiresIn });
  } catch (error) {
    throw mapB2Error(error);
  }
}
