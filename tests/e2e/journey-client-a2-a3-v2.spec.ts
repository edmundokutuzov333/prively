import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

test('A.2-A.3 client auth and KYC evidence v2', async ({ page }) => {
  const ts = Date.now();
  const email = 'e2e-ui-client-v2-' + ts + '@example.test';
  const password = 'PrivelyUiE2E!V2' + ts;
  const handle = 'ui_client_v2_' + String(ts).slice(-6);
  const userIdHolder = { id: '' };
  try {
    await page.goto('/idade');
    await page.getByTestId('age-gate-confirm').click();
    await page.goto('/registo');
    await page.locator('input[autocomplete="username"]').fill(handle);
    await page.locator('input[type="email"]').fill(email);
    const checks = page.locator('input[type="checkbox"]');
    await expect(checks).toHaveCount(3);
    await checks.nth(0).check(); await checks.nth(1).check(); await checks.nth(2).check();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /registar|criar conta/i }).click();
    await expect(page.getByRole('status')).toContainText(/confirma/i);
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = listed.data.users.find((u) => u.email === email);
    if (!match) throw new Error('signup_user_not_found');
    userIdHolder.id = match.id;
    const exact = await admin.auth.admin.getUserById(match.id);
    if (exact.error) throw exact.error;
    console.log('A.2.6 DB auth.users=', JSON.stringify({ id: exact.data.user?.id, email_confirmed_at: exact.data.user?.email_confirmed_at ?? null }));
    expect(exact.data.user?.email_confirmed_at ?? null).toBeNull();
    const pre = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const preLogin = await pre.auth.signInWithPassword({ email, password });
    console.log('A.2.7 login-before-confirm=', JSON.stringify({ session: Boolean(preLogin.data.session), error: preLogin.error?.message ?? null }));
    expect(preLogin.data.session).toBeNull();
    const mailpit = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=50').then((r) => r.json());
    const mail = (mailpit.messages ?? []).find((m: { To?: Array<{ Address?: string }> }) => (m.To ?? []).some((to) => to.Address === email));
    console.log('A.2.6 MAILPIT confirmation=', JSON.stringify({ found: Boolean(mail?.ID), id: mail?.ID ?? null }));
    expect(mail?.ID).toBeTruthy();
    const confirmed = await admin.auth.admin.updateUserById(match.id, { email_confirm: true });
    if (confirmed.error) throw confirmed.error;
    const afterConfirm = await admin.auth.admin.getUserById(match.id);
    console.log('A.2.8 DB auth.users=', JSON.stringify({ email_confirmed_at: afterConfirm.data.user?.email_confirmed_at ?? null }));
    expect(afterConfirm.data.user?.email_confirmed_at).toBeTruthy();
    await page.goto('/entrar');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/palavra-passe|password/i).fill(password);
    await page.getByRole('button', { name: /entrar|iniciar sessão/i }).click();
    await page.waitForURL(/\/descobrir|\/verificacao/);
    const profile = await admin.from('profiles').select('id,handle,display_name,status,age_verified_at').eq('id', match.id).single();
    console.log('A.2.10 DB profiles=', JSON.stringify(profile.data));
    expect(profile.data?.handle).toBe(handle);
    await page.goto('/verificacao');
    await expect(page.getByRole('heading')).toBeVisible();
    const inputs = page.locator('input[type="file"]');
    await expect(inputs).toHaveCount(2);
    const tiny = Buffer.from([0xff,0xd8,0xff,0xd9]);
    await inputs.nth(0).setInputFiles({ name: 'document.jpg', mimeType: 'image/jpeg', buffer: tiny });
    await inputs.nth(1).setInputFiles({ name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: tiny });
    await page.getByRole('button', { name: /submeter|enviar/i }).click();
    const kyc = await admin.from('kyc_verifications').select('id,status,provider,doc_path,selfie_path').eq('user_id', match.id).order('created_at', { ascending: false }).limit(1);
    console.log('A.3.12 DB KYC=', JSON.stringify(kyc.data));
    const objects = await admin.storage.from('prively-kyc').list(match.id, { limit: 20 });
    console.log('A.3.12 STORAGE=', JSON.stringify(objects.data));
    expect(kyc.data?.[0]?.status).toBe('pending');
    expect((objects.data ?? []).length).toBeGreaterThanOrEqual(2);
    console.log('VERDICT A.2-A.3=PASS_WITH_AAL2_SEPARATED');
  } finally {
    if (userIdHolder.id) await admin.auth.admin.deleteUser(userIdHolder.id);
  }
}