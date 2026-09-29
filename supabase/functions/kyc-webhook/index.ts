import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';
import { ConfiguredKycProvider } from '../_shared/kyc.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') return jsonResponse({ code: 'method_not_allowed' }, 405, request);
  try {
    const rawBody = await request.text();
    const outcome = await new ConfiguredKycProvider().parseWebhook(rawBody, request.headers);
    const admin = serviceClient();
    const { data, error } = await admin.rpc('apply_kyc_result', {
      _user_id: outcome.userId,
      _provider: Deno.env.get('KYC_PROVIDER') ?? 'configured',
      _provider_ref: outcome.providerRef,
      _status: outcome.status,
      _min_age_verified: outcome.minAgeVerified,
      _reason: outcome.reason ?? null,
      _document_expires_at: outcome.documentExpiresAt ?? null,
    });
    if (error) return jsonResponse({ code: error.message }, 422, request);
    return jsonResponse({ ok: true, id: data }, 200, request);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'kyc_webhook_failed';
    return jsonResponse({ code }, code === 'invalid_signature' ? 401 : 400, request);
  }
});
