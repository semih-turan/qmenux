import { expect, test } from '@playwright/test';

function luminance(rgb: string): number {
  const channels = rgb.match(/\d+/g)!.slice(0, 3).map(value => {
    const s = Number(value) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0]! + 0.05) / (l[1]! + 0.05);
}

for (const port of [3001, 3002]) {
  test(`shared management brand and accessible layout at ${port}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(`http://127.0.0.1:${port}`);
    const palette = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
      return { tokens: ['primary', 'ink', 'canvas', 'red', 'mustard', 'sage'].map(name => root.getPropertyValue(`--brand-${name}`).trim()),
        color: body.color, background: body.backgroundColor, scheme: root.colorScheme };
    });
    expect(palette.tokens).toEqual(['#e86a33', '#252420', '#f7f5f0', '#c94b3b', '#d9a441', '#66745c']);
    expect(palette.scheme).toBe('light');
    expect(contrast(palette.color, palette.background)).toBeGreaterThanOrEqual(4.5);
    await expect(page.getByRole('main')).toHaveClass('management-shell');
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      // Doubling the root font approximates text enlargement independently of viewport scaling.
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    const controls = page.getByRole('main').getByRole('button');
    for (const control of await controls.all()) {
      const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
      const colors = await control.evaluate(element => {
        const style = getComputedStyle(element); return { color: style.color, background: style.backgroundColor };
      });
      expect(contrast(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('public menu does not inherit management tokens or shell', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary'))).toBe('');
  await expect(page.getByRole('main')).not.toHaveClass('management-shell');
});
