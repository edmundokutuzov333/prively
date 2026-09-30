  test('service worker source is served', async ({ request }) => {
    const response = await request.get('/sw.js');
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain('showNotification');
  });

  test('language selector changes document language', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-selector').click();
    await page.getByRole('button', { name: /^EN$/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});