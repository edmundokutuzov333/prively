import { test, expect } from '@playwright/test';

test('A.1 anonymous gate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('age-gate-confirm')).toBeVisible();
  console.log('A.1.1 UI age gate=visible');
  await page.goto('/feed');
  console.log('A.1.2 URL=' + page.url());
  await expect(page).toHaveURL(/\/entrar\?next=.*feed|\/verificacao|\/idade/);
  await page.goto('/');
  await page.getByTestId('age-gate-confirm').click();
  console.log('A.1.3 localStorage=' + await page.evaluate(() => localStorage.getItem('prively.age_verified')));
});