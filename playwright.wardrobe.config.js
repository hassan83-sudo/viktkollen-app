import { defineConfig } from '@playwright/test'
import process from 'node:process'

export default defineConfig({
  testDir: './tests/wardrobe',
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'https://127.0.0.1:5195',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.A11Y_CHROMIUM_EXECUTABLE || undefined },
    trace: 'off',
  },
  webServer: {
    command: 'node scripts/buildWardrobeOffline.mjs && node scripts/serveWardrobeOffline.mjs',
    url: 'https://127.0.0.1:5195',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 60000,
  },
})
