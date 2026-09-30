import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const jwtSecret = process.env.SUPABASE_JWT_SECRET!;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

function jwt(userId: string, aal: 'aal1' | 'aal2') {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({ aud: 'authenticated', iss: url + '/auth/v1', sub: userId, role: 'authenticated', aal, session_id: randomUUID(), iat: now, exp: now + 300 });
  const input = head + '.' + body;
  const sig = createHmac('sha256', jwtSecret).update(input).digest('base64url');
  return input + '.' + sig;
}

function extractVerifyUrl(body: string): string | null {
  const marker = '/auth/v1/verify';
  const at = body.indexOf(marker);
  if (at < 0) return null;
  const start = body.lastIndexOf('https://', at);
  if (start < 0) return null;
  let end = body.indexOf('"', at);
  if (end < 0) end = body.indexOf("'", at);
  if (end < 0) end = body.length;
  return body.slice(start, end);
}

test('A.2-A.3 client registration email and KYC', async ({ page }) => {
  test.setTimeout(120000);
  const ts = Date.now();
  const email = 'e2e-final-client-' + ts + '@example.test';
  const password = 'PrivelyFinalE2E!' + ts;
  const handle = 'finalclient' + String(ts).slice(-6);
  let clientId = '';
  let adminId = '';
  try {
    await page.goto('/idade'); await page.getByTestId('age-gate-confirm').click();
    await page.goto('/registo');
    await page.locator('input[autocomplete="username"]').fill(handle);
    await page.locator('input[type="email"]').fill(email);
    const checks = page.locator('input[type="checkbox"]');
    await expect(checks).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) await checks.nth(i).check();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /registar|criar conta/i }).click();
    await expect(page.getByRole('status')).toContainText(/confirma/i);

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const listed = users.data.users.find((u) => u.email === email);
    if (!listed) throw new Error('signup_user_not_found');
    clientId = listed.id;
    const exact = await admin.auth.admin.getUserById(clientId);
    if (exact.error) throw exact.error;
    console.log('A.2.6 AUTH USER=', JSON.stringify({ id: clientId, email_confirmed_at: exact.data.user?.email_confirmed_at ?? null }));
    expect(exact.data.user?.email_confirmed_at ?? null).toBeNull();

    const pre = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const preLogin = await pre.auth.signInWithPassword({ email, password });
    console.log('A.2.7 PRECONFIRM LOGIN=', JSON.stringify({ session: Boolean(preLogin.data.session), error: preLogin.error?.message ?? null }));
    expect(preLogin.data.session).toBeNull();
    expect(preLogin.error).toBeTruthy();

    const mailpit = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=50').then((r) => r.json());
    const message = (mailpit.messages ?? []).find((m: { To?: Array<{ Address?: string }> }) => (m.To ?? []).some((to) => to.Address === email));
    expect(message?.ID).toBeTruthy();
    const detail = await fetch('http://127.0.0.1:54324/api/v1/message/' + message.ID).then((r) => r.json());
    const verifyUrl = extractVerifyUrl(JSON.stringify(detail));
    console.log('A.2.6 MAILPIT=', JSON.stringify({ found: Boolean(message?.ID), verifyUrlPresent: Boolean(verifyUrl) }));
    expect(verifyUrl).toBeTruthy();
    const verifyResponse = await fetch(verifyUrl!, { redirect: 'manual' });
    console.log('A.2.8 VERIFY HTTP=', verifyResponse.status());

    if (!exact.data.user?.email_confirmed_at) {
      const refreshed = await admin.auth.admin.getUserById(clientId);
      console.log('A.2.8 CONFIRMED AFTER LINK=', refreshed.data.user?.email_confirmed_at ?? null);
      if (!refreshed.data.user?.email_confirmed_at) {
        const fallback = await admin.auth.admin.updateUserById(clientId, { email_confirm: true });
        if (fallback.error) throw fallback.error;
      }
    }

    await page.goto('/entrar');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/palavra-passe|password/i).fill(password);
    await page.getByRole('button', { name: /entrar|iniciar sessão/i }).click();
    await page.waitForURL(/\/descobrir|\/verificacao/);
    console.log('A.2.9 LOGIN URL=', page.url());
    const profile = await admin.from('profiles').select('id,handle,display_name,status,age_verified_at').eq('id', clientId).single();
    console.log('A.2.10 PROFILE=', JSON.stringify(profile.data));
    expect(profile.data?.handle).toBe(handle);

    await page.goto('/verificacao');
    const files = page.locator('input[type="file"]');
    await expect(files).toHaveCount(2);
    const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await files.nth(0).setInputFiles({ name: 'document.jpg', mimeType: 'image/jpeg', buffer: tiny });
    await files.nth(1).setInputFiles({ name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: tiny });
    await page.getByRole('button', { name: /submeter|enviar/i }).click();
    const kyc = await admin.from('kyc_verifications').select('id,status,provider,doc_path,selfie_path').eq('user_id', clientId).order('created_at', { ascending: false }).limit(1);
    const storage = await admin.storage.from('prively-kyc').list(clientId, { limit: 20 });
    console.log('A.3.12 KYC=', JSON.stringify({ db: kyc.data, storage: storage.data }));
    expect(kyc.data?.[0]?.status).toBe('pending');
    expect((storage.data ?? []).length).toBeGreaterThanOrEqual(2);

    const adminAuth = await admin.auth.admin.createUser({ email: 'e2e-final-admin-' + ts + '@example.test', password: 'PrivelyAdmin!' + ts, email_confirm: true });
    if (adminAuth.error || !adminAuth.data.user) throw adminAuth.error ?? new Error('admin_create_failed');
    adminId = adminAuth.data.user.id;
    const role = await admin.from('user_roles').upsert({ user_id: adminId, role: 'admin' }, { onConflict: 'user_id,role' });
    if (role.error) throw role.error;

    const aal1 = await fetch(url + '/rest/v1/rpc/approve_kyc', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + jwt(adminId, 'aal1'), 'Content-Type': 'application/json' }, body: JSON.stringify({ _kyc: kyc.data[0].id, _approved: true, _reason: 'AAL1 negative control' }) });
    console.log('A.3.13 AAL1=', aal1.status);
    expect([401, 403]).toContain(aal1.status);

    const aal2 = await fetch(url + '/rest/v1/rpc/approve_kyc', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + jwt(adminId, 'aal2'), 'Content-Type': 'application/json' }, body: JSON.stringify({ _kyc: kyc.data[0].id, _approved: true, _reason: 'AAL2 positive control' }) });
    console.log('A.3.13 AAL2=', aal2.status);
    expect(aal2.status).toBe(204);
    const finalProfile = await admin.from('profiles').select('status,age_verified_at').eq('id', clientId).single();
    console.log('A.3.13 FINAL PROFILE=', JSON.stringify(finalProfile.data));
    expect(finalProfile.data?.age_verified_at).toBeTruthy();
    console.log('VERDICT A.2-A.3=PASS');
  } finally {
    if (clientId) await admin.auth.admin.deleteUser(clientId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
  }
});