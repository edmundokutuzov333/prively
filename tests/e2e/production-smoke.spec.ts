import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('production_smoke_supabase_env_missing');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test('[production-smoke] production root boots with visible UI', async ({ page }) => {
  let lastBody = '';
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pageErrors: string[] = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });

    const response = await page.goto(process.env.PRIVELY_PRODUCTION_URL ?? 'https://prively.vercel.app/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await page.waitForTimeout(1200);
    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    const bootShellVisible = await page.locator('#boot-shell').count() > 0;
    lastBody = bodyText;
    lastErrors = [...pageErrors];
    console.log(JSON.stringify({ attempt: attempt + 1, status: response?.status() ?? null, bootShellVisible, body: bodyText.slice(0, 500), errors: pageErrors.slice(0, 10) }));

    if (response?.ok() && !bootShellVisible && bodyText.length > 80 && /Prively|18 anos|18 years|adult/i.test(bodyText) && pageErrors.length === 0) {
      expect(response.ok()).toBeTruthy();
      return;
    }

    if (attempt < 2) await page.waitForTimeout(2_000);
  }

  throw new Error(`production_blank_or_error body="${lastBody.slice(0, 500)}" errors="${lastErrors.join(' | ').slice(0, 1500)}"`);
});

test('[production-smoke] real client login leaves the submit loading state', async ({ page }) => {
  const ts = Date.now();
  const email = `production-login-${ts}@example.test`;
  const password = `PrivelyProductionE2E!${ts}`;
  const handle = `prod_${String(ts).slice(-7)}`;
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        handle,
        display_name: handle,
        signup_role: 'client',
        role: 'client',
        age_confirmed: true,
      },
    });

    if (created.error || !created.data.user) {
      throw created.error ?? new Error('production_login_fixture_create_failed');
    }
    userId = created.data.user.id;

    await page.goto('/entrar', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('#auth-email')).toBeVisible();
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(password);

    const submit = page.getByRole('button', { name: /entrar/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(submit).not.toHaveText(/A entrar/i, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/descobrir|\/verificacao/, { timeout: 15_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
