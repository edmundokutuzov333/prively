import { serviceClient } from '../_shared/auth.ts';
import { corsFor } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsFor(), 'content-type': 'application/json' } });

function sameSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  const admin = serviceClient();
  const supplied = request.headers.get('x-prively-job-token') ?? '';
  const { data: expected, error: secretError } = await admin.rpc('financial_secret', { _name: 'prively_media_job_token' });
  if (secretError || typeof expected !== 'string' || !sameSecret(supplied, expected)) return json({ code: 'forbidden' }, 403);
  await admin.rpc('reclaim_stale_media_jobs', { _after: '10 minutes' });
  const { data: claimed, error: claimError } = await admin.rpc('claim_media_job');
  if (claimError) return json({ code: 'claim_failed' }, 500);
  const jobId = Array.isArray(claimed) && claimed[0]?.job_id;
  if (!jobId) return json({ processed: 0 });
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-media-job`;
  const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`, 'content-type': 'application/json', 'x-prively-worker-token': supplied }, body: JSON.stringify({ jobId }) });
  return json({ processed: 1, jobId, workerStatus: response.status }, response.ok ? 200 : 502);
});
