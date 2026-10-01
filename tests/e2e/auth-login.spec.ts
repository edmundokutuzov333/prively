import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) throw new Error('missing_local_e2e_env');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test('real client login reaches the authenticated experience', async ({ page }) => {
  const ts = Date.now();
  const email = `e2e-login-${ts}@example.test`;
  const password = `PrivelyLoginE2E!${ts}`;
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        handle: `login_${String(ts).slice(-6)}`,
        display_name: `Login ${ts}`,
        signup_role: 'client',
        role: 'client',
        age_confirmed: true,
        legal_acceptances: {
          terms: { version: '1.0' },
          privacy: { version: '1.0' },
        },
      },
    });

    if (created.error || !created.data.user) {
      throw created.error ?? new Error('login_fixture_create_failed');
    }

    userId = created.data.user.id;

    await page.goto('/entrar');
    await expect(page.getByRole('heading')).toBeVisible();

    const emailInput = page.locator('#auth-email');
    const passwordInput = page.locator('#auth-password');
    await emailInput.fill(email);
    await passwordInput.fill(password);

    const submit = page.getByRole('button', { name: /entrar/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/descobrir|\/verificacao/, { timeout: 15000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
