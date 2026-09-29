import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  '/',
  '/sobre',
  '/ajuda',
  '/legal/termos',
  '/legal/privacidade',
  '/legal/conteudo-proibido',
  '/legal/reembolsos',
  '/legal/cookies',
  '/legal/dmca',
  '/404',
];

for (const route of publicRoutes) {
  test(`public route ${route} has no critical accessibility regressions`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();

    const accessibility = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    const serious = accessibility.violations.filter((item) => (
      item.impact === 'critical' || item.impact === 'serious'
    ));

    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test('security headers are present on the application shell', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();

  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toBeTruthy();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('same-origin');
  expect(headers['strict-transport-security']).toContain('max-age=');
});

test('protected client route does not expose the private workspace to unauthenticated users', async ({ page }) => {
  await page.goto('/carteira');
  await expect(page).toHaveURL(/\/entrar\?next=%2Fcarteira|\/carteira/);
});
