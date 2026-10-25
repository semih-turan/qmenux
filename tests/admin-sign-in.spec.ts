import { expect, test } from '@playwright/test';

test('admin sign-in handles loading, disabled providers, mobile touch targets and keyboard navigation', async ({ page }) => {
  await page.route('**/api/auth/providers', async route => {
    await route.fulfill({ json: { providers: [{ id: 'google', enabled: true }, { id: 'microsoft', enabled: false }, { id: 'apple', enabled: true }] } });
  });
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { status: 'unauthorized' } }));
  await page.goto('http://127.0.0.1:3001');
  const google = page.getByRole('button', { name: 'Google ile devam et', exact: true });
  await expect(google).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Microsoft / Outlook ile devam et' })).toBeDisabled();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.getByRole('main').getByRole('button').all()) {
      const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.keyboard.press('Tab'); await expect(google).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Apple ile devam et' })).toBeFocused();
  await page.route('**/api/auth/google/start', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-qmenux-request']).toBe('1');
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ status: 503, json: { status: 'unavailable' } });
  });
  await google.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Giriş başlatılamadı');
  await expect(google).toBeEnabled();
});

test('registered user sees approval state; failed logout keeps the session view and reports uncertain revocation', async ({ page, context }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { providers: [] } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { status: 'REGISTERED' }, tenantAccess: false } }));
  // Cookie transport is exercised with the actual handler in admin-auth.spec.ts.
  await context.addInitScript(() => Object.defineProperty(document, 'cookie', { get: () => `__Host-qmenux_admin_csrf=${'c'.repeat(43)}` }));
  await page.route('**/api/auth/logout', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('c'.repeat(43));
    await route.fulfill({ status: 503, json: { status: 'unavailable' } });
  });
  await page.goto('http://127.0.0.1:3001');
  await expect(page.getByRole('heading', { name: 'Hesabınızla giriş yaptınız' })).toBeVisible();
  await expect(page.getByText('İşletme erişimi için yönetici onayı', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Çıkış yap', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Oturumunuz açık olabilir');
  await expect(page.getByRole('button', { name: 'Çıkış yap', exact: true })).toBeEnabled();
});

test('real unconfigured admin HTTP routes fail closed without setting cookies; offline UI is recoverable', async ({ page, request }) => {
  for (const path of ['providers', 'me', 'google/callback?state=invalid&code=invalid']) {
    const res = await request.get(`http://127.0.0.1:3001/api/auth/${path}`);
    expect(res.status()).toBe(503); expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['set-cookie']).toBeUndefined(); expect(await res.json()).toEqual({ status: 'unavailable' });
  }
  const head = await request.head('http://127.0.0.1:3001/api/auth/google/callback');
  expect(head.status()).toBe(405); expect(head.headers()['cache-control']).toBe('no-store');
  await page.route('**/api/auth/*', route => route.abort('internetdisconnected'));
  await page.goto('http://127.0.0.1:3001');
  await expect(page.getByRole('status')).toContainText('bağlantı kurulamadı');
  for (const button of await page.getByRole('main').getByRole('button').all()) await expect(button).toBeDisabled();
});
