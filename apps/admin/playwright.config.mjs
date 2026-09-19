import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/admin-ui',
  testMatch: '*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4318', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/admin-ui/serve.mjs', url: 'http://127.0.0.1:4318', reuseExistingServer: false },
})
