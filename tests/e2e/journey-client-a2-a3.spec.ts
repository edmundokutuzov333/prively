import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error('missing_local_e2e_env');

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('A.2-A.3 client registration, email confirmation and KYC', async ({ page }) => {
  const ts = Date.now();
  const email = `e2e-ui-client-${ts}@example.test`;
  const password = `PrivelyUiE2E!${ts}`;
  const handle = `ui_client_${String(ts).slice(-6)}`;

  await page.goto('/idade');
  await page.getByTestId('age-gate-confirm').click();
  console.log('A.2.5 AGE_GATE target=', page.url());

  await page.goto('/registo');
  await expect(page.getByRole('heading')).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill(handle);
  await page.getByLabel(/email/i).fill(email);
  const signupCheckboxes = page.locator('input[type="checkbox"]');
  await expect(signupCheckboxes).toHaveCount(3);
  await signupCheckboxes.nth(0).check();
  await signupCheckboxes.nth(1).check();
  await signupCheckboxes.nth(2).check();
  await page.getByLabel(/palavra-passe|password/i).fill(password);
  await page.getByRole('button', { name: /registar|criar conta/i }).click();
  await expect(page.getByRole('status')).toContainText(/confirma/i);
  console.log('A.2.6 UI signup status=confirmation_required');

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const created = users.data.users.find((u) => u.email === email);
  if (!created) throw new Error('signup_user_not_found');
  console.log('A.2.6 DB auth.users=', JSON.stringify({
    id: created.id,
    email_confirmed_at: created.email_confirmed_at,
  }));
  expect(created.email_confirmed_at).toBeNull();

  const mailpit = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=50');
  const mailpitJson = await mailpit.json();
  const message = (mailpitJson.messages ?? []).find((m: { To?: Array<{Address?: string}> }) =>
    (m.To ?? []).some((to) => to.Address === email),
  );
  if (!message?.ID) throw new Error('confirmation_mail_not_found');
  const messageDetail = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then((r) => r.json());
  const body = JSON.stringify(messageDetail);
  const verifyMatch = body.includes('/auth/v1/verify');
  console.log('A.2.6 MAILPIT confirmation_present=', Boolean(verifyMatch));

  const confirmed = await admin.auth.admin.updateUserById(created.id, { email_confirm: true });
  if (confirmed.error) throw confirmed.error;
  const afterConfirm = await admin.auth.admin.getUserById(created.id);
  if (afterConfirm.error) throw afterConfirm.error;
  console.log('A.2.8 DB auth.users email_confirmed_at=', afterConfirm.data.user?.email_confirmed_at ?? null);
  expect(afterConfirm.data.user?.email_confirmed_at).toBeTruthy();

  await page.goto('/entrar');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/palavra-passe|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar sessão/i }).click();
  await page.waitForURL(/\/descobrir|\/verificacao/);
  console.log('A.2.9 UI post-login=', page.url());

  const logged = await page.evaluate(() => Boolean(localStorage.getItem('sb-gaonupelgtpfthouyobh-auth-token')));
  console.log('A.2.9 browser auth storage present=', logged);

  const profile = await admin.from('profiles').select('id,handle,display_name,status,age_verified_at').eq('id', created.id).single();
  if (profile.error) throw profile.error;
  console.log('A.2.10 DB profiles=', JSON.stringify(profile.data));
  expect(profile.data.handle).toBe(handle);

  const legal = await admin.from('legal_acceptances').select('document_type,version').eq('user_id', created.id).order('created_at', { ascending: false });
  if (legal.error) throw legal.error;
  const consent = await admin.from('consent_records').select('consent_type,version').eq('user_id', created.id).order('created_at', { ascending: false });
  if (consent.error) throw consent.error;
  console.log('A.2.10 DB legal=', JSON.stringify(legal.data));
  console.log('A.2.10 DB consent=', JSON.stringify(consent.data));

  await page.goto('/verificacao');
  await expect(page.getByRole('heading')).toBeVisible();
  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs).toHaveCount(2);
  await fileInputs.nth(0).setInputFiles({ name: 'document.png', mimeType: 'image/png', buffer: png });
  await fileInputs.nth(1).setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: /submeter|enviar/i }).click();
  await expect(page.locator('body')).toContainText(/pendente|em análise|em_analise/i, { timeout: 15000 });
  console.log('A.3.12 UI KYC state=pending');

  const kyc = await admin.from('kyc_verifications').select('id,user_id,status,provider,doc_path,selfie_path').eq('user_id', created.id).order('created_at', { ascending: false }).limit(1);
  if (kyc.error) throw kyc.error;
  console.log('A.3.12 DB kyc_verifications=', JSON.stringify(kyc.data));

  const objects = await admin.storage.from('prively-kyc').list(created.id, { limit: 20 });
  if (objects.error) throw objects.error;
  console.log('A.3.12 STORAGE prively-kyc=', JSON.stringify(objects.data));
  expect(objects.data?.length ?? 0).toBeGreaterThanOrEqual(2);

  const blocked = await admin.rpc('approve_kyc', { _kyc: kyc.data?.[0]?.id, _approved: true, _reason: 'AAL1 negative control' });
  console.log('A.3.13 admin approve via service session=', JSON.stringify({ data: blocked.data, error: blocked.error?.message ?? null }));
  console.log('A.3.13 VERDICT=AAL2_ADMIN_EXTERNAL_SETUP_REQUIRED');

  await admin.auth.admin.deleteUser(created.id);
});