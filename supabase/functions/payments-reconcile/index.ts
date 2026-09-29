import { serviceClient } from '../_shared/auth.ts';
import { corsFor } from '../_shared/cors.ts';
import { financialAlert } from '../_shared/alert.ts';
import { amountUnit, providerAmountToCentavos } from '../_shared/money.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsFor(), 'content-type': 'application/json' } });
function sameSecret(left: string, right: string): boolean { const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0; }

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  const admin = serviceClient();
  const { data: expected } = await admin.rpc('financial_secret', { _name: 'prively_payments_reconcile_token' });
  if (typeof expected !== 'string' || !sameSecret(request.headers.get('x-prively-job-token') ?? '', expected)) return json({ code: 'forbidden' }, 403);
  const endpoint = Deno.env.get('PAYSUITE_STATUS_URL');
  if (!endpoint) return json({ ok: true, skipped: true, reason: 'provider_not_configured' });
  const unit = amountUnit();
  const { data: topups, error } = await admin.from('topups').select('id,provider_ref,amount,status').in('status', ['pending', 'processing']).lt('requested_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(100);
  if (error) return json({ code: 'topups_load_failed' }, 500);
  let reconciled = 0;
  for (const topup of topups ?? []) {
    if (!topup.provider_ref) continue;
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(topup.provider_ref)}`, { headers: { authorization: `Bearer ${Deno.env.get('PAYSUITE_API_KEY') ?? ''}` } });
    if (!response.ok) { await financialAlert('payments_reconcile_provider_error', 'high', `Provider status failed with ${response.status}`, { topupId: topup.id }); continue; }
    const body = await response.json() as Record<string, unknown>;
    const rawStatus = String(body.status ?? body.state ?? '').toLowerCase();
    const status = rawStatus === 'successful' || rawStatus === 'paid' || rawStatus === 'completed' ? 'paid' : ['failed', 'cancelled', 'expired', 'reversed'].includes(rawStatus) ? rawStatus : 'processing';
    const rawAmount = body.amount ?? (body.data as Record<string, unknown> | undefined)?.amount;
    const amount = providerAmountToCentavos(rawAmount, unit);
    const { error: creditError } = await admin.rpc('credit_topup', { _provider_ref: topup.provider_ref, _status: status, _amount: amount, _provider_transaction_id: typeof body.transaction_id === 'string' ? body.transaction_id : null });
    if (creditError) { await financialAlert('payments_reconcile_credit_error', 'high', creditError.message, { topupId: topup.id }); continue; }
    reconciled += 1;
  }
  return json({ ok: true, reconciled });
});
