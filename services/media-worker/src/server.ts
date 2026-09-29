import express from 'express';
import { makeBlurPreview } from './blur.js';
import { validSignature, type MediaJobRequest } from './contract.js';

const app = express();
app.use(express.json({ limit: process.env.MEDIA_MAX_JSON ?? '1mb' }));
app.post('/health', (_request, response) => response.json({ ok: true, service: 'media-worker', contractVersion: '1' }));
app.post('/v1/media', async (request, response) => {
  const rawBody = JSON.stringify(request.body);
  if (!validSignature(rawBody, request.header('x-prively-signature'), process.env.MEDIA_PROCESSOR_HMAC_SECRET ?? '')) return response.status(401).json({ status: 'failed', code: 'invalid_signature' });
  const job = request.body as Partial<MediaJobRequest>;
  if (job.contractVersion !== '1' || typeof job.jobId !== 'string' || typeof job.assetId !== 'string' || typeof job.sourceUrl !== 'string') return response.status(400).json({ status: 'failed', code: 'invalid_contract' });
  try {
    const source = await fetch(job.sourceUrl);
    if (!source.ok) return response.status(502).json({ status: 'failed', code: 'source_unavailable' });
    const input = Buffer.from(await source.arrayBuffer());
    if (job.fileSizeBytes && input.byteLength !== job.fileSizeBytes) return response.status(422).json({ status: 'failed', code: 'source_size_mismatch' });
    const preview = job.kind === 'image' ? await makeBlurPreview(input) : null;
    return response.json({ status: 'succeeded', contractVersion: '1', jobId: job.jobId, assetId: job.assetId, output: { thumbnailPath: `${job.assetId}/derived/blur_preview.jpg`, ...(preview ? { previewBytes: preview.byteLength } : {}) } });
  } catch {
    return response.status(500).json({ status: 'failed', code: 'processing_failed' });
  }
});
app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
