import { expect, test } from '@playwright/test';

for (const [port, heading] of [[3000, 'Menü'], [3001, 'İşletme yönetimi'], [3002, 'Platform yönetimi']] as const) {
  test(`${heading}: mobile shell, no activation or sign-in controls`, async ({ page }) => {
    const response = await page.goto(`http://127.0.0.1:${port}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
}
