import { parseProviderJson, requiredEnv } from './payments.ts';

export type KycOutcome = {
  userId: string;
  status: 'approved' | 'rejected' | 'needs_review';
  providerRef: string;
  minAgeVerified: boolean;
  reason?: string;
  documentExpiresAt?: string;
};

export interface KycProvider {
  createSession(input: { userId: string; locale: string }): Promise<{ url: string; providerRef: string }>;
  parseWebhook(rawBody: string, headers: Headers): Promise<KycOutcome>;
}

function equal(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class ConfiguredKycProvider implements KycProvider {
  async createSession(input: { userId: string; locale: string }) {
    const endpoint = requiredEnv('KYC_START_URL');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${requiredEnv('KYC_API_KEY')}` }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error('kyc_provider_unavailable');
    const body = parseProviderJson(await response.json());
    if (typeof body.url !== 'string' || typeof body.providerRef !== 'string') throw new Error('kyc_provider_invalid_response');
    return { url: body.url, providerRef: body.providerRef };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<KycOutcome> {
    const signature = headers.get(Deno.env.get('KYC_SIGNATURE_HEADER') ?? 'x-kyc-signature') ?? '';
    const expected = await hmac(rawBody, requiredEnv('KYC_WEBHOOK_SECRET'));
    if (!equal(signature, expected)) throw new Error('invalid_signature');
    const body = parseProviderJson(JSON.parse(rawBody));
    const status = String(body.status ?? '').toLowerCase();
    if (!['approved', 'rejected', 'needs_review'].includes(status)) throw new Error('kyc_provider_invalid_status');
    if (typeof body.userId !== 'string' || typeof body.providerRef !== 'string') throw new Error('kyc_provider_missing_reference');
    return { userId: body.userId, status: status as KycOutcome['status'], providerRef: body.providerRef, minAgeVerified: body.minAgeVerified === true, reason: typeof body.reason === 'string' ? body.reason : undefined, documentExpiresAt: typeof body.documentExpiresAt === 'string' ? body.documentExpiresAt : undefined };
  }
}
