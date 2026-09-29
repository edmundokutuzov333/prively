import express from 'express';
import { makeBlurPreview } from './blur.js';
import { validSignature, type MediaJobRequest } from './contract.js';

const app = express();
app.use(express.json({ limit: process.env.MEDIA_MAX_JSON ?? '1mb' }));

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function authorized(request: express.Request, rawBody: string): boolean {
  const bearer = request.header('authorization') ?? '';
  const expectedToken = process.env.MEDIA_PROCESSOR_TOKEN ?? '';
  const presentedToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!expectedToken || !constantTimeEqual(presentedToken, expectedToken)) return false;
  const secret = process.env.MEDIA_PROCESSOR_HMAC_SECRET ?? '';
  return validSignature(rawBody, request.header('x-prively-signature'), secret);
}

function sourceAllowed(sourceUrl: string): boolean {
  const allowedOrigins = (process.env.MEDIA_ALLOWED_SOURCE_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.length) return false;
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === 'https:' && allowedOrigins.some((origin) => {
      try { return parsed.origin === new URL(origin).origin; } catch { return false; }
    });
  } catch {
    return false;
  }
}

app.get('/health', (_request, response) => response.json({ ok: true, service: 'media-worker', contractVersion: '1' }));
app.post('/v1/media', async (request, response) => {
  const rawBody = JSON.stringify(request.body);
  if (!authorized(request, rawBody)) return response.status(401).json({ status: 'failed', code: 'invalid_worker_credentials' });
  const job = request.body as Partial<MediaJobRequest>;
  if (job.contractVersion !== '1' || typeof job.jobId !== 'string' || typeof job.assetId !== 'string' || typeof job.sourceUrl !== 'string') {
    return response.status(400).json({ status: 'failed', code: 'invalid_contract' });
  }
  if (!sourceAllowed(job.sourceUrl)) return response.status(403).json({ status: 'failed', code: 'source_origin_not_allowed' });
  try {
    const source = await fetch(job.sourceUrl);
    if (!source.ok) return response.status(502).json({ status: 'failed', code: 'source_unavailable' });
    const input = Buffer.from(await source.arrayBuffer());
    if (job.fileSizeBytes && input.byteLength !== job.fileSizeBytes) return response.status(422).json({ status: 'failed', code: 'source_size_mismatch' });
    const preview = job.kind === 'image' ? await makeBlurPreview(input) : null;
    return response.json({
      status: 'succeeded',
      contractVersion: '1',
      jobId: job.jobId,
      assetId: job.assetId,
      output: {
        thumbnailPath: `${job.assetId}/derived/blur_preview.jpg`,
        ...(preview ? { previewBytes: preview.byteLength } : {}),
      },
    });
  } catch {
    return response.status(500).json({ status: 'failed', code: 'processing_failed' });
  }
});

app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');