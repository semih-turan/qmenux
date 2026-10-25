import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  use: { browserName: 'chromium' },
  webServer: ['menu-pwa', 'admin-pwa', 'superadmin-pwa'].map((app, i) => ({
    command: `pnpm --filter @qmenux/${app} dev`,
    url: `http://127.0.0.1:${3000 + i}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  })),
});
