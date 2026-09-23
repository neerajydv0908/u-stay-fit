import { defineConfig, devices } from '@playwright/test';
// PLAYWRIGHT_CHROMIUM_PATH lets a machine with a pre-installed Chromium skip the download.
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    // Through the Vite proxy, so both the page server and the API are ready before tests start.
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    // Two browser projects share one server; the production sign-in allowance is too small for them.
    env: { LOCAL_DATABASE_PATH: '.data/browser-tests', AUTH_RATE_LIMIT: '1000' },
  },
});
