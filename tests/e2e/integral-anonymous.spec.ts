import { expect, test } from '@playwright/test';

test.describe('integral journey A.1 anonymous', () => {
  test('A.1.1 root exposes age gate and records security headers', async ({ page }) => {
    const response = await page.goto('/');
    await page.waitForLoadState('networkidle');
    const headers = response?.headers() ?? {};
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    const screenshot = await page.screenshot({ path: 'test-results/a1-root.png', fullPage: true });
    console.log('A1.1 URL=', page.url());
    console.log('A1.1 TITLE=', await page.title());
    console.log('A1.1 BODY=', text.slice(0, 2000));
    console.log('A1.1 HEADERS=', JSON.stringify({
      'content-security-policy': headers['content-security-policy'],
      'strict-transport-security': headers['strict-transport-security'],
      'x-frame-options': headers['x-frame-options'],
      'x-content-type-options': headers['x-content-type-options'],
      'referrer-policy': headers['referrer-policy']
    }));
    console.log('A1.1 STORAGE=', JSON.stringify(await page.evaluate(() => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      cookies: document.cookie
    }))));
    console.log('A1.1 AGE_GATE_TEXT_PRESENT=', /idade|18\+|maior de idade/i.test(text));
    console.log('A1.1 SECURITY_EXPECTED_FROM_VERCEL_CONFIG=', JSON.stringify({ CSP_FRAME_ANCESTORS: "frame-ancestors 'none'", HSTS: 'max-age=31536000; includeSubDomains; preload', X_FRAME_OPTIONS: 'DENY' }));
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/18\+/i);
    await expect(page.getByRole('button').filter({ hasText: /confirm/i })).toBeVisible();
    expect(screenshot).toBeTruthy();
  });

  test('A.1.2 direct feed is protected', async ({ page }) => {
    const response = await page.goto('/feed');
    await page.waitForLoadState('networkidle');
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    console.log('A1.2 STATUS=', response?.status());
    console.log('A1.2 FINAL_URL=', page.url());
    console.log('A1.2 BODY=', body.slice(0, 1200));
    expect(page.url()).toMatch(/\/entrar\?next=.*feed|\/verificacao|\/estado\/acesso-negado/);
  });

  test('A.1.3 confirm age persists verification before authentication', async ({ page }) => {
    await page.goto('/idade?role=client');
    await page.waitForLoadState('networkidle');
    const before = await page.evaluate(() => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      cookies: document.cookie
    }));
    console.log('A1.3 BEFORE=', JSON.stringify(before));
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    console.log('A1.3 BODY=', body.slice(0, 1200));
    const confirm = page.getByTestId('age-gate-confirm');
    if (await confirm.count()) {
      await confirm.click();
      await page.waitForLoadState('networkidle').catch(() => {});
    }
    const after = await page.evaluate(() => ({
      url: location.href,
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      cookies: document.cookie
    }));
    console.log('A1.3 AFTER=', JSON.stringify(after));
    console.log('A1.3 SESSION_PRESENT=', Boolean(after.localStorage['supabase.auth.token'] || after.cookies.match(/sb-/i)));
    expect(after.url).toMatch(/\/entrar/);
    expect(after.localStorage['prively.age_verified']).toBe('1');
    expect(after.cookies).toMatch(/prively_age_verified=1/);
  });

  test('A.1.4 admin is protected', async ({ page }) => {
    const response = await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    console.log('A1.4 STATUS=', response?.status());
    console.log('A1.4 FINAL_URL=', page.url());
    console.log('A1.4 BODY=', body.slice(0, 1200));
    expect(page.url()).toMatch(/\/admin\/entrar|\/estado\/acesso-negado/);
    await expect(page.locator('body')).not.toContainText(/Dashboard Admin|Administração|Utilizadores/i);
  });
});
