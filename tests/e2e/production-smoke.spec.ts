import { test, expect } from '@playwright/test';

test('[production-smoke] production root boots with visible UI', async ({ page }) => {
  let lastBody = '';
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
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
    lastBody = bodyText;
    lastErrors = [...pageErrors];

    if (response?.ok() && bodyText.length > 80 && /Prively|18 anos|18 years|adult/i.test(bodyText) && pageErrors.length === 0) {
      expect(response.ok()).toBeTruthy();
      return;
    }

    if (attempt < 19) {
      await page.waitForTimeout(15_000);
    }
  }

  throw new Error(`production_blank_or_error body="${lastBody.slice(0, 500)}" errors="${lastErrors.join(' | ').slice(0, 1500)}"`);
});
