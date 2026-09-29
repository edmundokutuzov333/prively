import { serviceClient } from './auth.ts';

export async function financialAlert(kind: string, severity: 'low' | 'medium' | 'high', message: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const admin = serviceClient();
  await admin.from('financial_alerts').insert({ kind, severity, message, metadata });
  const endpoint = Deno.env.get('ALERT_WEBHOOK_URL');
  const secret = Deno.env.get('ALERT_WEBHOOK_SECRET');
  if (!endpoint) return;
  await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify({ kind, severity, message, metadata }) });
}
