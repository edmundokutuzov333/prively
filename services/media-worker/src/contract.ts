import { createHmac, timingSafeEqual } from 'node:crypto';

export type MediaJobRequest = {
  contractVersion: '1'; jobId: string; assetId: string;
  jobType: 'thumbnail' | 'hls' | 'watermark' | 'advanced_media'; sourceUrl: string;
  kind: 'image' | 'video' | 'audio'; mimeType: string; fileSizeBytes: number;
  sha256: string | null; watermarkText?: string | null;
};

export function validSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const left = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'));
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
