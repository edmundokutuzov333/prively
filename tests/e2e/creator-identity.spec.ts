import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error('missing_local_e2e_env');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestUser(kind: 'no-kyc' | 'approved') {
  const ts = Date.now();
  const email = `phase1-creator-${kind}-${ts}@example.test`;
  const password = `PrivelyCreatorE2E!${ts}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    throw created.error ?? new Error('creator_e2e_user_create_failed');
  }

  const userId = created.data.user.id;

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    handle: `p1${kind === 'no-kyc' ? 'nokyc' : 'app'}${String(ts).slice(-10)}`,
    display_name: `Phase 1 ${kind}`,
    status: kind === 'approved' ? 'active' : 'pending',
    age_verified_at: kind === 'approved' ? new Date().toISOString() : null,
  });

  if (profileError) throw profileError;

  const { error: roleError } = await admin.from('user_roles').upsert({
    user_id: userId,
    role: 'client',
  });

  if (roleError) throw roleError;

  if (kind === 'approved') {
    const { error: kycError } = await admin.from('kyc_verifications').insert({
      user_id: userId,
      provider: 'manual',
      status: 'approved',
      doc_type: 'identity_document',
      doc_path: `${userId}/document.jpg`,
      selfie_path: `${userId}/selfie.jpg`,
      reviewed_at: new Date().toISOString(),
    });

    if (kycError) throw kycError;
  }

  return { userId, email, password };
}

async function loginCreator(page: Page, email: string, password: string) {
  await page.goto('/entrar?role=creator');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/descobrir|\/se-criadora/);
}

test.describe('Parte 1 identity creator role', () => {
  test('sem KYC aprovado bloqueia o acesso de criadora', async ({ page }) => {
    const fixture = await createTestUser('no-kyc');

    try {
      await loginCreator(page, fixture.email, fixture.password);
      await page.goto('/se-criadora');
      await expect(page.getByText('Completa a verificação de identidade antes de te tornares criadora.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ir para verificação' })).toHaveAttribute('href', '/verificacao');
    } finally {
      await admin.auth.admin.deleteUser(fixture.userId);
    }
  });

  test('com KYC aprovado atribui creator e abre onboarding', async ({ page }) => {
    const fixture = await createTestUser('approved');

    try {
      await loginCreator(page, fixture.email, fixture.password);
      await page.goto('/se-criadora');
      await expect(page.getByRole('button', { name: 'Torna-te criadora' })).toBeVisible();
      await page.getByRole('button', { name: 'Torna-te criadora' }).click();
      await expect(page).toHaveURL(/\/se-criadora\/passos$/);

      const { data: role, error } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', fixture.userId)
        .eq('role', 'creator')
        .maybeSingle();

      expect(error).toBeNull();
      expect(role?.role).toBe('creator');
    } finally {
      await admin.auth.admin.deleteUser(fixture.userId);
    }
  });
});
