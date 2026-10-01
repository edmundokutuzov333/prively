import { test, expect } from '@playwright/test';

test('production root boots with visible UI', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  const response = await page.goto(process.env.PRIVELY_PRODUCTION_URL ?? 'https://prively.vercel.app/', {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });

  expect(response?.ok()).toBeTruthy();

  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  expect(bodyText.length).toBeGreaterThan(80);
  expect(bodyText).toMatch(/Prively|18 anos|18 years|adult/i);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
