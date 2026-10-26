import { expect, test } from '@playwright/test';

for (const [port, heading] of [[3000, 'Menü'], [3001, 'İşletme yönetimi'], [3002, 'Platform yönetimi']] as const) {
  test(`${heading}: mobile shell, no activation controls`, async ({ page }) => {
    const response = await page.goto(`http://127.0.0.1:${port}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    // Inspect application content; Next.js development tools live outside main.
    if (port === 3001) {
      await expect(page.getByRole('main').getByRole('button')).toHaveCount(3);
      for (const button of await page.getByRole('main').getByRole('button').all()) await expect(button).toBeDisabled();
    } else if(port===3002) {
      await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
      await expect(page.getByRole('button',{name:'Yeniden kontrol et',exact:true})).toBeEnabled();
    } else await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
}
