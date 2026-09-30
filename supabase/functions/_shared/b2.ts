import { GetObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.1142.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1142.0";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function b2Endpoint(): string {
  const endpoint = env("B2_ENDPOINT");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("b2_endpoint_must_be_https");
  return url.toString().replace(//$/, "");
}

export function b2Bucket(): string {
  return env("B2_BUCKET_NAME");
}

export function b2Client(): S3Client {
  return new S3Client({
    region: env("B2_REGION"),
    endpoint: b2Endpoint(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: env("B2_KEY_ID"),
      secretAccessKey: env("B2_APPLICATION_KEY"),
    },
  });
}

export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: b2Bucket(),
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(b2Client(), command, {
    expiresIn,
    signableHeaders: new Set(["content-type"]),
  });
}

export async function presignDownload(
  key: string,
  expiresIn = 60,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: b2Bucket(),
    Key: key,
  });

  return await getSignedUrl(b2Client(), command, { expiresIn });
}
