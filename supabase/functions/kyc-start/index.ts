import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { ConfiguredKycProvider } from '../_shared/kyc.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') return jsonResponse({ code: 'method_not_allowed' }, 405, request);
  try {
    const { user } = await requireUser(request);
    const providerConfigured = Boolean(Deno.env.get('KYC_START_URL') && Deno.env.get('KYC_API_KEY') && Deno.env.get('KYC_WEBHOOK_SECRET'));
    if (!providerConfigured) return jsonResponse({ mode: 'manual', reason: 'kyc_provider_not_configured' }, 200, request);
    const body = await request.json().catch(() => ({})) as { locale?: unknown };
    const session = await new ConfiguredKycProvider().createSession({ userId: user.id, locale: typeof body.locale === 'string' ? body.locale : 'pt-MZ' });
    return jsonResponse({ mode: 'provider', url: session.url, providerRef: session.providerRef }, 200, request);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'kyc_start_failed';
    return jsonResponse({ code }, code === 'unauthorized' ? 401 : 503, request);
  }
});
