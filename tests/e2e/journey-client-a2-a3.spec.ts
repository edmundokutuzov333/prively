import { createHmac, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
if (!url || !anon || !service || !jwtSecret) throw new Error('missing_local_e2e_env');

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

function signAccessToken(userId: string, aal: 'aal1' | 'aal2', sessionId: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 120,
    iat: Math.floor(Date.now() / 1000),
    iss: url + '/auth/v1',
    role: 'authenticated',
    aal,
    session_id: sessionId,
    sub: userId,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = encode(header) + '.' + encode(payload);
  const signature = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url');
  return signingInput + '.' + signature;
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('A.2-A.3 client registration, email confirmation and KYC', async ({ page }) => {
  const ts = Date.now();
  const email = `e2e-ui-client-${ts}@example.test`;
  const password = `PrivelyUiE2E!${ts}`;
  const handle = `ui_client_${String(ts).slice(-6)}`;
  let createdUserId: string | null = null;
  let adminUserId: string | null = null;

  try {
    await page.goto('/idade');
    await page.getByTestId('age-gate-confirm').click();
    console.log('A.2.5 AGE_GATE target=', page.url());

    await page.goto('/registo');
    await expect(page.getByRole('heading')).toBeVisible();
    await page.locator('input[autocomplete="username"]').fill(handle);
    await page.locator('input[type="email"]').fill(email);
    const signupCheckboxes = page.locator('input[type="checkbox"]');
    await expect(signupCheckboxes).toHaveCount(3);
    await signupCheckboxes.nth(0).check();
    await signupCheckboxes.nth(1).check();
    await signupCheckboxes.nth(2).check();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /registar|criar conta/i }).click();
    await expect(page.getByRole('status')).toContainText(/confirma/i);
    console.log('A.2.6 UI signup status=confirmation_required');

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw users.error;
    const listed = users.data.users.find((u) => u.email === email);
    if (!listed) throw new Error('signup_user_not_found');
    const createdResult = await admin.auth.admin.getUserById(listed.id);
    if (createdResult.error) throw createdResult.error;
    const created = createdResult.data.user;
    createdUserId = created.id;
    console.log('A.2.6 DB auth.users=', JSON.stringify({
      id: created.id,
      email_confirmed_at: created.email_confirmed_at ?? null,
    }));
    expect(created.email_confirmed_at ?? null).toBeNull();

    const preConfirmClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const preLogin = await preConfirmClient.auth.signInWithPassword({ email, password });
    console.log('A.2.7 login-before-confirm=', JSON.stringify({ session: Boolean(preLogin.data.session), error: preLogin.error?.message ?? null }));
    expect(preLogin.data.session).toBeNull();
    expect(preLogin.error).toBeTruthy();

    const mailpit = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=50');
    const mailpitJson = await mailpit.json();
    const message = (mailpitJson.messages ?? []).find((m: { To?: Array<{Address?: string}> }) =>
      (m.To ?? []).some((to) => to.Address === email),
    );
    if (!message?.ID) throw new Error('confirmation_mail_not_found');

    const messageDetail = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then((r) => r.json());
    const body = JSON.stringify(messageDetail);
    const verifyUrlMatch = body.includes('/auth/v1/verify');
    if (!verifyUrlMatch) throw new Error('confirmation_verify_link_not_found');

    console.log('A.2.6 MAILPIT confirmation_present=true');
    console.log('A.2.7 AUTH verify endpoint observed=true');

    const verifyUrlMatch = body.match(/https?:\/\/[^"'\\\s<]+\/auth\/v1\/verify\?[^"'\\\s<]+/);
    if (!verifyUrlMatch) throw new Error('confirmation_verify_url_missing');
    const verifyUrl = verifyUrlMatch[0].replace(/&amp;/g, '&');
    await page.goto(verifyUrl);
    await expect.poll(async () => {
      const confirmed = await admin.auth.admin.getUserById(created.id);
      if (confirmed.error) throw confirmed.error;
      return Boolean(confirmed.data.user?.email_confirmed_at);
    }, { timeout: 10000 }).toBeTruthy();

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

    const kyc = await admin.from('kyc_verifications')
      .select('id,user_id,status,provider,doc_path,selfie_path')
      .eq('user_id', created.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (kyc.error) throw kyc.error;
    console.log('A.3.12 DB kyc_verifications=', JSON.stringify(kyc.data));

    const objects = await admin.storage.from('prively-kyc').list(created.id, { limit: 20 });
    if (objects.error) throw objects.error;
    console.log('A.3.12 STORAGE prively-kyc=', JSON.stringify(objects.data));
    expect(objects.data?.length ?? 0).toBeGreaterThanOrEqual(2);

    const kycId = kyc.data?.[0]?.id;
    if (!kycId) throw new Error('kyc_id_missing');

    const adminEmail = `e2e-admin-${ts}@example.test`;
    const adminPassword = `PrivelyAdminE2E!${ts}`;
    const createdAdmin = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    if (createdAdmin.error || !createdAdmin.data.user) {
      throw createdAdmin.error ?? new Error('admin_user_create_failed');
    }
    adminUserId = createdAdmin.data.user.id;

    const adminRole = await admin.from('user_roles').upsert(
      { user_id: adminUserId, role: 'admin' },
      { onConflict: 'user_id,role' },
    );
    if (adminRole.error) throw adminRole.error;

    const aal1Token = signAccessToken(adminUserId, 'aal1', randomUUID());
    const aal1Response = await fetch(`${url}/rest/v1/rpc/approve_kyc`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: 'Bearer ' + aal1Token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        _kyc: kycId,
        _approved: true,
        _reason: 'AAL1 negative control',
      }),
    });
    const aal1Body = await aal1Response.text();
    console.log('A.3.13 AAL1 approve HTTP=', aal1Response.status, 'body=', aal1Body);
    expect([401, 403]).toContain(aal1Response.status);

    const aal2Token = signAccessToken(adminUserId, 'aal2', randomUUID());
    const aal2Response = await fetch(`${url}/rest/v1/rpc/approve_kyc`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: 'Bearer ' + aal2Token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        _kyc: kycId,
        _approved: true,
        _reason: 'AAL2 positive control',
      }),
    });
    const aal2Body = await aal2Response.text();
    console.log('A.3.13 AAL2 approve HTTP=', aal2Response.status, 'body=', aal2Body);
    expect(aal2Response.status).toBe(204);

    const finalKyc = await admin.from('kyc_verifications')
      .select('status,reviewed_by,reviewed_at')
      .eq('id', kycId)
      .single();
    if (finalKyc.error) throw finalKyc.error;

    const finalProfile = await admin.from('profiles')
      .select('status,age_verified_at')
      .eq('id', created.id)
      .single();
    if (finalProfile.error) throw finalProfile.error;

    console.log('A.3.14 DB final KYC=', JSON.stringify(finalKyc.data));
    console.log('A.3.14 DB final profile=', JSON.stringify(finalProfile.data));
    expect(finalKyc.data.status).toBe('approved');
    expect(finalProfile.data.age_verified_at).toBeTruthy();
  } finally {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
  }
});
