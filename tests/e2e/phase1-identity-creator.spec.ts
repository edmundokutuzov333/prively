import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error('missing_local_e2e_env');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function provisionUser(email: string, password: string, handle: string, verified: boolean) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { handle, display_name: handle, signup_role: 'client', role: 'client' },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error('creator_phase_user_create_failed');
  }

  const userId = created.data.user.id;
  const profile = await admin.from('profiles').upsert({
    id: userId,
    handle,
    display_name: handle,
    status: verified ? 'active' : 'pending',
    age_verified_at: verified ? new Date().toISOString() : null,
  }, { onConflict: 'id' });
  if (profile.error) throw profile.error;

  if (verified) {
    const kyc = await admin.from('kyc_verifications').insert({
      user_id: userId,
      provider: 'manual',
      status: 'approved',
      doc_type: 'identity_document',
      doc_path: userId + '/phase1-document.png',
      selfie_path: userId + '/phase1-selfie.png',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      reason: 'phase1 e2e approved fixture',
    });
    if (kyc.error) throw kyc.error;
  }

  return userId;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/entrar');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/palavra-passe|password/i).fill(password);
  await page.getByRole('button', { name: /entrar|iniciar sessão|sign in/i }).click();
  await page.waitForURL(/\/descobrir|\/verificacao/);
}

test.describe('phase 1 identity and creator role', () => {
  test('approved identity can become creator and reaches creator onboarding', async ({ page }) => {
    const ts = Date.now();
    const email = 'phase1-creator-' + ts + '@example.test';
    const password = 'Phase1Creator!' + ts;
    const handle = 'phase1_creator_' + String(ts).slice(-6);
    let userId: string | null = null;

    try {
      userId = await provisionUser(email, password, handle, true);
      await signIn(page, email, password);

      await page.goto('/se-criadora');
      await expect(page.getByRole('heading', { name: /sê criadora|become a creator|devenir créatrice/i })).toBeVisible();
      const grantButton = page.getByRole('button', { name: /torna-te criadora|become a creator|devenir créatrice/i });
      await expect(grantButton).toBeEnabled();

      await grantButton.click();
      await page.waitForURL('/se-criadora/passos');

      const roles = await admin.from('user_roles').select('role').eq('user_id', userId);
      if (roles.error) throw roles.error;
      expect(roles.data?.some((row) => row.role === 'creator')).toBe(true);

      const audit = await admin.from('audit_log')
        .select('event_type,target_type,target_id')
        .eq('actor_id', userId)
        .eq('event_type', 'creator_role_granted')
        .eq('target_id', userId)
        .limit(1);
      if (audit.error) throw audit.error;
      expect(audit.data?.length).toBe(1);
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });

  test('client without approved KYC is blocked before creator role grant', async ({ page }) => {
    const ts = Date.now();
    const email = 'phase1-no-kyc-' + ts + '@example.test';
    const password = 'Phase1NoKyc!' + ts;
    const handle = 'phase1_no_kyc_' + String(ts).slice(-6);
    let userId: string | null = null;

    try {
      userId = await provisionUser(email, password, handle, false);
      await signIn(page, email, password);

      await page.goto('/se-criadora');
      await expect(page.getByText(/completa a verificação de identidade antes de te tornares criadora|complete identity verification before becoming a creator|termine la vérification d’identité avant de devenir créatrice/i)).toBeVisible();
      await expect(page.getByRole('link', { name: /ir para verificação|go to verification|aller à la vérification/i })).toBeVisible();

      const roles = await admin.from('user_roles').select('role').eq('user_id', userId);
      if (roles.error) throw roles.error;
      expect(roles.data?.some((row) => row.role === 'creator')).toBe(false);
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });
});