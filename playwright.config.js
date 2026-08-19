import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const externalServer = process.env.VIKTKOLLEN_E2E_EXTERNAL_SERVER === '1'

export default defineConfig({
  expect: {
    timeout: 8000,
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: externalServer ? undefined : {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    reuseExistingServer: true,
    timeout: 30000,
    url: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
})
